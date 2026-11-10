/**
 * "A YLA submission is packaged and waiting for you" — the internal email sent
 * when the sweep passes an application while YLA_SUBMIT_HOLD is on.
 *
 * Internal only: this goes to us, never to the client or to YLA. It carries the
 * Drive link so the folder can be checked before anything leaves, and says
 * exactly where the release button is.
 *
 * Sent as transactional (commercial: false) — it's an internal operational
 * notice, and an unsubscribe from marketing must not silently swallow it.
 */
import { sendBrevoEmail } from "./brevo";
import { log } from "./logger";

/** Who gets told. Comma-separated; defaults to the validated NextKey sender. */
function recipients(): string[] {
  const raw = process.env.YLA_HOLD_NOTIFY || "sean.l@nextkey.com.au";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function origin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function notifyYlaSubmissionHeld(opts: {
  primaryApplicant: string;
  clientRef: string | null;
  driveUrl: string;
  requestId: string;
}): Promise<void> {
  const who = opts.primaryApplicant || "Applicant";
  const ref = opts.clientRef ? ` (${opts.clientRef})` : "";
  const listUrl = `${origin()}/document-requests`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.5">
    <p><strong>${escapeHtml(who)}${escapeHtml(ref)}</strong> has passed verification and the full package is in Drive — including the signed Needs Analysis and Credit File Authorisation.</p>
    <p><strong>Nothing has been sent to YLA.</strong> It's held for you to check.</p>
    <p style="margin:20px 0">
      <a href="${escapeHtml(opts.driveUrl)}" style="display:inline-block;background:#0F4C5C;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Open the Drive folder</a>
    </p>
    <p>When you're happy with it, press <strong>Send to YLA</strong> on <a href="${escapeHtml(listUrl)}">${escapeHtml(listUrl)}</a>. That emails YLA the COMP-8317 calendar invite with this Drive link.</p>
    <p style="font-size:13px;color:#666">You're getting this because YLA_SUBMIT_HOLD is on. Turn it off to let the sweep submit unattended.</p>
  </div>`;

  const text = `${who}${ref} has passed verification and the full package is in Drive, including the signed Needs Analysis and Credit File Authorisation.

NOTHING HAS BEEN SENT TO YLA — it's held for you to check.

Drive folder: ${opts.driveUrl}

When you're happy with it, press "Send to YLA" on ${listUrl}. That emails YLA the COMP-8317 calendar invite with this Drive link.

You're getting this because YLA_SUBMIT_HOLD is on. Turn it off to let the sweep submit unattended.`;

  const to = recipients().map((email) => ({ email }));
  const res = await sendBrevoEmail({
    to,
    subject: `Ready for YLA — ${who}${ref} (held for your check)`,
    html,
    text,
    tags: ["yla-submission-held"],
  });
  // Never let a failed notice break the sweep — the hold itself already
  // happened, and the application is visible in the CRM either way.
  if (!res.ok) log.error("yla.hold_notify_failed", { requestId: opts.requestId, error: res.error });
  else log.info("yla.hold_notified", { requestId: opts.requestId, recipients: to.length });
}
