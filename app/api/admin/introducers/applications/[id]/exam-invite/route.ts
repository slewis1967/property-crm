import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../_shared";
import {
  findById,
  setState,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import {
  mintExamInvite,
  examInviteUrl,
  canSitExam,
  onboardingTablesMissing,
} from "../../../../../../../utils/introducer-onboarding";
import { sendOnboardingStepEmail } from "../../../../../../../utils/introducer-onboarding-email";

/**
 * Issue (or re-issue) an applicant's exam invitation.
 *
 * The invitation is an HMAC-signed assertion of who they are, minted here and
 * verified by the accreditation site with the same secret. It is the mechanism
 * by which the name on a certificate is one WE stated rather than one the
 * candidate typed — so this route is the only place an exam link is created,
 * and it refuses to create one for an applicant whose identity has not been
 * verified yet.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const secret = process.env.INVITE_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "INVITE_SECRET is not set, so an exam invitation cannot be signed. Set the same value here and on the accreditation site.",
      },
      { status: 503 },
    );
  }

  let application;
  try {
    application = await findById(id);
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    throw err;
  }

  if (!application) {
    return NextResponse.json({ ok: false, error: "No such application." }, { status: 404 });
  }

  // The gate, stated plainly so the answer is useful rather than a bare 409.
  if (!canSitExam(application.state)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          application.state === "invited" || application.state === "nda_signed" || application.state === "id_uploaded"
            ? "Their identity has not been verified yet. Verify the licence first — an exam invitation asserts who they are, so it cannot be issued before we know."
            : `This application is ${application.state.replace(/_/g, " ")}, so an exam invitation would not do anything.`,
      },
      { status: 409 },
    );
  }

  const token = mintExamInvite(
    {
      id: application.id,
      name: application.legal_name,
      entity: application.firm_name ?? "",
      abn: application.abn ?? "",
      email: application.email,
      tier: application.tier,
    },
    secret,
  );

  const url = examInviteUrl(token);
  const reissue = application.state === "course_started";

  // Rotate the onboarding link at the same time. They are being sent somewhere
  // new; the credential that takes them there should be current.
  const freshToken = await reissueToken(application.id);

  let emailed = true;
  let emailError: string | null = null;
  try {
    await sendOnboardingStepEmail({
      to: application.email,
      legalName: application.legal_name,
      rawToken: freshToken,
      origin: new URL(req.url).origin,
      heading: reissue ? "Your accreditation course link" : "Your accreditation course is ready",
      body:
        `Your identity has been verified, so the course is open. It takes a few hours and the exam is ` +
        `100% to pass, with as many attempts as you need — you can stop and come back at any point.` +
        `<br><br>Start here: <a href="${url}">${url}</a>`,
      cta: "See where you are",
    });
  } catch (err) {
    emailed = false;
    emailError = (err as { message?: string })?.message ?? "send failed";
  }

  if (application.state === "id_verified") {
    await setState(application.id, "course_started");
  }

  await logOnboardingEvent(application.id, "super_admin", auth, reissue ? "exam_invite_reissued" : "exam_invite_issued", {
    emailed,
    email_error: emailError,
  });

  return NextResponse.json({
    ok: true,
    // Returned so staff can hand the link over directly if the email bounces.
    // It is a signed assertion of identity, not a secret in itself — but it is
    // still personal to the applicant, so the UI says so.
    exam_url: url,
    emailed,
    email_error: emailError,
    reissued: reissue,
  });
}
