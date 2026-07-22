/**
 * POST /api/document-requests/<id>/submit-to-yla   (AUTHED)
 *
 * The submit primitive: verify the application, and — only if it PASSES and has
 * been packaged to Drive — email YLA the .ics calendar invite with the Drive
 * link (their COMP-8317 process). Records the verification verdict either way.
 *
 * SAFETY: nothing is emailed to YLA unless YLA_AUTOSUBMIT_ENABLED === "true".
 * Otherwise (or with ?dry_run=1) it verifies + reports what it WOULD send, so
 * the pipeline can be exercised before it goes live to a real partner. A fail or
 * an un-exported set never reaches YLA.
 *
 * This is also the primitive the auto-submit sweep (stage 2) will call.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { sendBrevoEmail } from "../../../../../utils/brevo";
import { runApplicationVerification } from "../../../../../utils/yla-verification-run";
import { buildYlaInvite } from "../../../../../utils/yla-submit";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ylaAutoSubmitEnabled(): boolean {
  return process.env.YLA_AUTOSUBMIT_ENABLED === "true";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const forceDry = new URL(req.url).searchParams.get("dry_run") === "1";

  const run = await runApplicationVerification(id, { visual: true });
  if (!run.ok) return NextResponse.json({ ok: false, error: run.error }, { status: run.status });

  const now = new Date();
  const failing = run.result.docs.filter((d) => !d.pass);
  const status = run.result.pass ? "passed" : run.result.complete ? "failed" : null;

  // Record the verdict on every request of the application (best-effort).
  if (status) {
    await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .update({
        verification_status: status,
        verified_at: now.toISOString(),
        verification_issues: failing.map((d) => ({ filename: d.filename, applicant: d.applicant, issues: d.issues })),
        updated_at: now.toISOString(),
      })
      .in("id", run.siblingIds);
  }

  // Gate 1: not complete.
  if (!run.result.complete) {
    return NextResponse.json({ ok: false, stage: "incomplete", verification: run.result }, { status: 409 });
  }
  // Gate 2: verification failed — surface issues, send NOTHING.
  if (!run.result.pass) {
    return NextResponse.json(
      { ok: false, stage: "verification_failed", verification: run.result, failing },
      { status: 422 },
    );
  }
  // Gate 3: must be packaged to Drive first (the manual "Send to Drive" step; the
  // stage-2 sweep will do this automatically).
  if (!run.driveFolderUrl) {
    return NextResponse.json(
      { ok: false, stage: "not_exported", error: "Passed verification — export to Drive first, then submit to YLA." },
      { status: 409 },
    );
  }
  // Gate 4: already sent.
  if (run.ylaSubmittedAt) {
    return NextResponse.json({ ok: false, stage: "already_submitted", submitted_at: run.ylaSubmittedAt }, { status: 409 });
  }

  const invite = buildYlaInvite({
    primaryApplicant: run.primaryApplicant,
    driveUrl: run.driveFolderUrl,
    clientRef: run.clientRef,
    applicationId: run.applicationId,
    requestId: id,
    now,
  });

  const dryRun = forceDry || !ylaAutoSubmitEnabled();
  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      enabled: ylaAutoSubmitEnabled(),
      verification: run.result,
      preview: { to: invite.to, subject: invite.subject, body_line: invite.bodyLine, event: invite.eventStart },
    });
  }

  const emailRes = await sendBrevoEmail({
    to: [{ email: invite.to, name: "Your Loan Assist" }],
    subject: invite.subject,
    html: invite.html,
    text: invite.text,
    attachments: [{ name: "invite.ics", content: invite.icsBase64 }],
    tags: ["yla-submission"],
  });
  if (!emailRes.ok) {
    return NextResponse.json({ ok: false, stage: "send_failed", error: emailRes.error }, { status: 502 });
  }

  await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({ yla_submitted_at: now.toISOString(), updated_at: now.toISOString() })
    .in("id", run.siblingIds);

  return NextResponse.json({
    ok: true,
    submitted: true,
    to: invite.to,
    subject: invite.subject,
    drive_folder_url: run.driveFolderUrl,
    applicants: run.siblingIds.length,
  });
}
