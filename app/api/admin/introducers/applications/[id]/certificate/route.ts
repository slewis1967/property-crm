import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../_shared";
import {
  findById,
  setState,
  allocateAccreditationNumber,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { sendAccreditationPassedEmail } from "../../../../../../../utils/introducer-onboarding-email";

/**
 * Issue the certificate.
 *
 * Normally automatic: the exam webhook allocates the number and moves the
 * application straight to `exam_passed`. This route exists for the cases that
 * are not normal — a webhook that never arrived, an email that bounced, a
 * certificate that needs reissuing after a name correction.
 *
 * Allocation is idempotent in SQL, so a reissue never mints a second number.
 * That matters: the number appears on the agreement, in the register and on the
 * certificate itself, and a person having two of them would be worse than
 * having none.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let app;
  try {
    app = await findById(id);
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    throw err;
  }
  if (!app) return NextResponse.json({ ok: false, error: "No such application." }, { status: 404 });

  if (app.state !== "exam_passed" && app.state !== "certificate_issued") {
    return NextResponse.json(
      {
        ok: false,
        error:
          app.state === "course_started" || app.state === "id_verified"
            ? "They have not passed the exam yet."
            : `This application is ${app.state.replace(/_/g, " ")} — there is no certificate to issue.`,
      },
      { status: 409 },
    );
  }

  const accreditationNo = await allocateAccreditationNumber(id);
  const reissue = app.state === "certificate_issued";

  if (!reissue) {
    await setState(id, "certificate_issued");
  }

  await logOnboardingEvent(id, "super_admin", auth, reissue ? "certificate_reissued" : "certificate_issued", {
    accreditation_no: accreditationNo,
  });

  let emailed = true;
  try {
    const fresh = await reissueToken(id);
    await sendAccreditationPassedEmail({
      to: app.email,
      legalName: app.legal_name,
      accreditationNo,
      rawToken: fresh,
      origin: new URL(req.url).origin,
    });
  } catch (err) {
    emailed = false;
    await logOnboardingEvent(id, "system", null, "certificate_email_failed", {
      error: (err as { message?: string })?.message ?? "send failed",
    });
  }

  return NextResponse.json({
    ok: true,
    accreditation_no: accreditationNo,
    reissued: reissue,
    emailed,
    // The certificate document itself is still rendered by hand from
    // 03-course/certificate.html in the accreditation repo. Wiring that to a
    // server-side PDF is the remaining half of this step.
    pdf_generated: false,
  });
}
