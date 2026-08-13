import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  findById,
  recordExamAttempt,
  allocateAccreditationNumber,
  setState,
  logOnboardingEvent,
  reissueToken,
} from "../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../utils/introducer-onboarding";
import { sendAccreditationPassedEmail } from "../../../../utils/introducer-onboarding-email";

/**
 * Exam result webhook — the accreditation site telling us how someone did.
 *
 * WHY IT LIVES UNDER /api/introducer/. That prefix is already exempt from
 * Cloudflare Access (isPublicIntroducerRoute in proxy.ts), and the caller is a
 * Netlify function on a different origin that will never hold a CF Access
 * identity. Putting it here means no new Access app — which matters, because
 * adding one needs the Cloudflare dashboard by hand. The CF exemption is not
 * authentication and was never doing that job: this route authenticates itself
 * with a shared secret, below.
 *
 * FOUR THINGS ARE CHECKED, and a pass needs all four:
 *   1. The shared secret matches, compared in constant time.
 *   2. The identity was ISSUED, not typed. A result whose identitySource is
 *      "self-declared" is recorded and then ignored — it proves nothing about
 *      who sat the exam, which is the entire reason invites exist.
 *   3. The application exists and is at a point where sitting an exam makes
 *      sense. A pass cannot resurrect a withdrawn application or re-open an
 *      activated one.
 *   4. The attempt is not one we have already seen (idempotent on paperId), so
 *      a retried delivery does not re-issue a certificate or re-send an email.
 *
 * Every attempt is recorded whether or not it passes, and whether or not it is
 * acted on. A forged or misdirected call leaves a trail rather than a silence.
 */
export const dynamic = "force-dynamic";

function secretMatches(presented: string | null): boolean {
  const expected = process.env.EXAM_RESULT_TOKEN;
  // No secret configured means the endpoint is closed, not open. Failing open
  // here would make the whole invite mechanism decorative.
  if (!expected) return false;
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!secretMatches(req.headers.get("x-internal-auth"))) {
    // Deliberately terse. An unauthenticated caller learns nothing about
    // whether the endpoint exists in a useful form.
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const applicationId = typeof body.applicationId === "string" ? body.applicationId : "";
  const paperId = typeof body.paperId === "string" ? body.paperId : "";
  const passed = body.passed === true;
  const identitySource = typeof body.identitySource === "string" ? body.identitySource : "";

  if (!paperId) {
    return NextResponse.json({ ok: false, error: "paperId is required" }, { status: 400 });
  }

  // An attempt with no application id is someone sitting the course outside the
  // pipeline. That should stop happening once INVITE_REQUIRED=1 is set on the
  // accreditation site, but until then it is worth accepting and logging rather
  // than dropping on the floor — silence would hide exactly the gap we are
  // closing.
  if (!applicationId) {
    console.warn("[exam-result] attempt with no application id", { paperId, identitySource, passed });
    return NextResponse.json({ ok: true, recorded: false, reason: "no_application" });
  }

  let application;
  try {
    application = await findById(applicationId);
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "onboarding not enabled" }, { status: 503 });
    }
    throw err;
  }

  if (!application) {
    console.warn("[exam-result] unknown application", { applicationId, paperId });
    return NextResponse.json({ ok: true, recorded: false, reason: "unknown_application" });
  }

  // Record first, decide second. Whatever we conclude below, the attempt itself
  // is part of the accreditation record.
  const { duplicate } = await recordExamAttempt(applicationId, {
    paperId,
    tier: typeof body.tier === "string" ? body.tier : "t1",
    score: Number(body.score ?? 0),
    total: Number(body.total ?? 0),
    passed,
    missedModules: Array.isArray(body.missedModules) ? (body.missedModules as string[]) : [],
    redLineModules: Array.isArray(body.redLineModules) ? (body.redLineModules as string[]) : [],
    itemIds: Array.isArray(body.itemIds) ? (body.itemIds as string[]) : [],
    markedAt: typeof body.markedAt === "string" ? body.markedAt : undefined,
    integrity: body.integrity ?? null,
  });

  if (duplicate) {
    return NextResponse.json({ ok: true, recorded: false, reason: "already_recorded" });
  }

  if (!passed) {
    // Failures move nothing. The candidate re-reads the modules they missed and
    // tries again; the course handles the cooldown.
    return NextResponse.json({ ok: true, recorded: true, advanced: false });
  }

  if (identitySource !== "invite") {
    // A pass we cannot attribute is not a pass. Recorded above, acted on never.
    await logOnboardingEvent(applicationId, "system", null, "exam_pass_ignored", {
      reason: "identity was self-declared, not issued",
      paper_id: paperId,
    });
    return NextResponse.json({ ok: true, recorded: true, advanced: false, reason: "identity_not_issued" });
  }

  if (application.state !== "id_verified" && application.state !== "course_started") {
    await logOnboardingEvent(applicationId, "system", null, "exam_pass_ignored", {
      reason: `application is ${application.state}`,
      paper_id: paperId,
    });
    return NextResponse.json({ ok: true, recorded: true, advanced: false, reason: "wrong_state" });
  }

  // Allocate the number before moving the state, so a failure here cannot leave
  // an application marked as certificated without one.
  const accreditationNo = await allocateAccreditationNumber(applicationId);

  await setState(applicationId, "exam_passed", {
    exam_paper_id: paperId,
    exam_score: Number(body.score ?? 0),
    exam_total: Number(body.total ?? 0),
    exam_passed_at: new Date().toISOString(),
  });

  await logOnboardingEvent(applicationId, "system", null, "exam_passed", {
    paper_id: paperId,
    accreditation_no: accreditationNo,
  });

  // The applicant's onboarding link is rotated at this point. They are about to
  // be sent a link to sign an agreement, and the credential that reaches that
  // step should not be the same one that has been sitting in an inbox since the
  // invitation.
  let emailed = true;
  try {
    const freshToken = await reissueToken(applicationId);
    await sendAccreditationPassedEmail({
      to: application.email,
      legalName: application.legal_name,
      accreditationNo,
      rawToken: freshToken,
      origin: new URL(req.url).origin,
    });
  } catch (err) {
    emailed = false;
    await logOnboardingEvent(applicationId, "system", null, "exam_pass_email_failed", {
      error: (err as { message?: string })?.message ?? "send failed",
    });
  }

  return NextResponse.json({
    ok: true,
    recorded: true,
    advanced: true,
    accreditation_no: accreditationNo,
    emailed,
  });
}
