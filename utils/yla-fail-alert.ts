/**
 * What happens on OUR side when the YLA sweep flags an application.
 *
 * The client already gets a fixup email (utils/yla-remediation-email.ts). Until
 * this existed, that was ALL that happened: the verdict sat in a column no
 * screen displayed, the opportunity page kept saying "Ready to submit", and the
 * first anyone internal heard of it was asking why a client never reached YLA
 * (NK-10017 Libman, Sept 2026 — flagged on the 6th, found on the 11th, after a
 * Thursday cutoff had gone by). So a failure now also:
 *
 *   1. emails Sean + Glenn, marked URGENT, with the client's name in the
 *      subject and every failing file with its reason, and
 *   2. opens (or refreshes) a task on the client's contact, so it sits on the
 *      opportunity page until the set passes — when it closes itself.
 *
 * Fires at the same cadence as the client email: once per failed verification,
 * which the sweep only repeats when the client uploads something new. Internal
 * and operational, so it is sent transactional (commercial: false) — a
 * marketing unsubscribe must never swallow it.
 *
 * Never throws: the verdict is already recorded before this runs, and a failed
 * notice must not break the sweep for the applications after this one.
 */
import { supabase } from "./supabase";
import { sendBrevoEmail } from "./brevo";
import { log } from "./logger";
import type { DocVerdict } from "./yla-verification";
import { flaggedForSibling, slotNameFromFilename, type FixupAction, type Sibling } from "./yla-remediation-email";

/** `tasks.source` for these tasks — how a pass finds and closes them. */
export const FAIL_TASK_SOURCE = "yla-verification";

/** Who is told. Comma-separated override; defaults to Sean + Glenn. */
export function failAlertRecipients(): string[] {
  const raw = process.env.YLA_FAIL_ALERT_TO || "sean.l@nextkey.com.au,glenn.m@nextkey.com.au";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The headers Outlook, Apple Mail and Gmail read as "high importance". */
export const URGENT_HEADERS: Record<string, string> = {
  "X-Priority": "1 (Highest)",
  "X-MSMail-Priority": "High",
  Importance: "High",
  Priority: "urgent",
};

export type ApplicantFailure = {
  name: string;
  /** Each failing file by its portal slot name, with the reasons. */
  docs: { slot: string; issues: string[] }[];
  /** What the client was told: their address, or why they weren't emailed. */
  clientEmail: { sent: true; to: string } | { sent: false; reason: string };
};

/** "Marcia & Mark Libman" when they share a surname, else both full names. */
export function householdName(names: string[]): string {
  const clean = names.map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (clean.length === 0) return "Applicant";
  if (clean.length === 1) return clean[0]!;
  const surname = (n: string) => n.split(" ").slice(-1)[0]!.toLowerCase();
  if (clean.every((n) => surname(n) === surname(clean[0]!))) {
    const firsts = clean.map((n) => n.split(" ")[0]!);
    const last = clean[0]!.split(" ").slice(-1)[0]!;
    return `${firsts.slice(0, -1).join(", ")} & ${firsts[firsts.length - 1]} ${last}`;
  }
  return `${clean.slice(0, -1).join(", ")} & ${clean[clean.length - 1]}`;
}

/** Split an application's failing verdicts by applicant (the same "Applicant N"
 * numbering the client email uses) and pair each with what the client was told. */
export function groupFailuresByApplicant(
  siblings: Sibling[],
  docs: DocVerdict[],
  fixups: FixupAction[],
): ApplicantFailure[] {
  const failed = docs.filter((d) => !d.pass);
  const solo = siblings.length === 1;
  const out: ApplicantFailure[] = [];
  siblings.forEach((sib, i) => {
    const mine = flaggedForSibling(failed, i, solo);
    if (mine.length === 0) return;
    const fx = fixups.find((f) => f.requestId === sib.id);
    const clientEmail: ApplicantFailure["clientEmail"] =
      fx && fx.action === "emailed"
        ? { sent: true, to: fx.to }
        : fx && fx.action === "would_email"
          ? { sent: false, reason: "client emails are switched off (CLIENT_DOC_FIXUP_ENABLED)" }
          : fx && fx.action === "skipped"
            ? { sent: false, reason: fx.reason }
            : { sent: false, reason: "no fixup email was attempted" };
    out.push({
      name: sib.applicant_name || `Applicant ${i + 1}`,
      docs: mine.map((d) => ({ slot: slotNameFromFilename(d.filename), issues: d.issues })),
      clientEmail,
    });
  });
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function origin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}

/** "Fri 11 Sep, 1:22 pm" in Brisbane time — the team reads AEST. */
function aest(d: Date): string {
  return d.toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildFailAlert(opts: {
  household: string;
  clientRef: string | null;
  applicants: ApplicantFailure[];
  /** Blockers that are OURS to fix (e.g. an unsigned Needs Analysis), not the client's. */
  missing: string[];
  crmUrl: string;
  verifiedAt: Date;
}): { subject: string; html: string; text: string } {
  const ref = opts.clientRef ? ` (${opts.clientRef})` : "";
  const fileCount = opts.applicants.reduce((n, a) => n + a.docs.length, 0);
  const subject = `URGENT — ${opts.household}${ref}: documents failed YLA check`;

  const headline =
    `${opts.household}${ref} can't go to YLA yet. ` +
    (fileCount > 0 ? `${fileCount} document${fileCount === 1 ? "" : "s"} failed the check` : "The check failed") +
    ` on ${aest(opts.verifiedAt)}. Nothing has been sent to YLA.`;

  const clientLine = (a: ApplicantFailure) =>
    a.clientEmail.sent
      ? `${a.name} has been emailed a fresh upload link and this list (${a.clientEmail.to}).`
      : `${a.name} has NOT been emailed — ${a.clientEmail.reason}. Contact them directly.`;

  const htmlApplicants = opts.applicants
    .map(
      (a) => `<p style="margin:16px 0 4px"><strong>${escapeHtml(a.name)}</strong></p>
      <ul style="margin:0;padding-left:20px">${a.docs
        .map((d) => `<li style="margin:0 0 6px"><strong>${escapeHtml(d.slot)}</strong> — ${escapeHtml(d.issues.join("; ") || "failed")}</li>`)
        .join("")}</ul>
      <p style="margin:6px 0 0;font-size:14px;color:${a.clientEmail.sent ? "#555" : "#b91c1c"}">${escapeHtml(clientLine(a))}</p>`,
    )
    .join("");
  const htmlMissing = opts.missing.length
    ? `<p style="margin:16px 0 4px"><strong>Also blocking — ours to fix</strong></p>
       <ul style="margin:0;padding-left:20px">${opts.missing.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`
    : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.5">
    <p style="margin:0 0 12px;padding:10px 14px;background:#fef2f2;border-left:4px solid #b91c1c;color:#7f1d1d;font-weight:bold">${escapeHtml(headline)}</p>
    ${htmlApplicants}
    ${htmlMissing}
    <p style="margin:18px 0 6px">Once the files are replaced, the check re-runs automatically (every couple of hours) and a passing set goes straight to YLA. YLA's cutoff is <strong>Thursday COB</strong> — a miss costs a week.</p>
    <p style="margin:20px 0">
      <a href="${escapeHtml(opts.crmUrl)}" style="display:inline-block;background:#b91c1c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Open in the CRM</a>
    </p>
  </div>`;

  const textApplicants = opts.applicants
    .map((a) => `${a.name}\n${a.docs.map((d) => `  • ${d.slot} — ${d.issues.join("; ") || "failed"}`).join("\n")}\n  ${clientLine(a)}`)
    .join("\n\n");
  const textMissing = opts.missing.length ? `\n\nALSO BLOCKING — OURS TO FIX\n${opts.missing.map((m) => `  • ${m}`).join("\n")}` : "";
  const text = `${headline}

${textApplicants}${textMissing}

Once the files are replaced, the check re-runs automatically (every couple of hours) and a passing set goes straight to YLA. YLA's cutoff is Thursday COB — a miss costs a week.

Open in the CRM: ${opts.crmUrl}`;

  return { subject, html, text };
}

/** Plain-text body for the CRM task — the same facts as the email. */
export function buildFailTaskBody(opts: {
  applicants: ApplicantFailure[];
  missing: string[];
  verifiedAt: Date;
}): string {
  const lines: string[] = [`Failed the YLA document check on ${aest(opts.verifiedAt)}. Nothing has been sent to YLA.`, ""];
  for (const a of opts.applicants) {
    lines.push(`${a.name}:`);
    for (const d of a.docs) lines.push(`  • ${d.slot} — ${d.issues.join("; ") || "failed"}`);
    lines.push(
      a.clientEmail.sent
        ? `  Client emailed ${a.clientEmail.to} with a fresh upload link.`
        : `  Client NOT emailed (${a.clientEmail.reason}) — contact them directly.`,
    );
    lines.push("");
  }
  if (opts.missing.length) {
    lines.push("Also blocking — ours to fix:");
    for (const m of opts.missing) lines.push(`  • ${m}`);
    lines.push("");
  }
  lines.push("Closes itself when the set passes. YLA cutoff: Thursday COB.");
  return lines.join("\n");
}

/** Open a task on the contact, or refresh the one already open for this — a
 * second failure (the client re-uploaded, still wrong) updates the task rather
 * than stacking another beside it. */
async function upsertFailTask(opts: { contactId: string; title: string; body: string; now: Date }): Promise<"created" | "updated"> {
  const { data: open, error } = await supabase
    .from("tasks")
    .select("id")
    .eq("contact_id", opts.contactId)
    .eq("source", FAIL_TASK_SOURCE)
    .eq("completed", false)
    .limit(1);
  if (error) throw new Error(`task lookup failed: ${error.message}`);
  const iso = opts.now.toISOString();
  if (open && open.length > 0) {
    const { error: upErr } = await supabase
      .from("tasks")
      .update({ title: opts.title, body: opts.body, due_date: iso, updated_at: iso })
      .eq("id", open[0]!.id);
    if (upErr) throw new Error(`task update failed: ${upErr.message}`);
    return "updated";
  }
  const { error: insErr } = await supabase.from("tasks").insert({
    contact_id: opts.contactId,
    title: opts.title,
    body: opts.body,
    due_date: iso,
    completed: false,
    source: FAIL_TASK_SOURCE,
  });
  if (insErr) throw new Error(`task insert failed: ${insErr.message}`);
  return "created";
}

/** On a pass: close any open failure task for the contact — it's resolved. */
export async function closeFailTasks(contactId: string | null, now: Date): Promise<void> {
  if (!contactId) return;
  const { error } = await supabase
    .from("tasks")
    .update({ completed: true, updated_at: now.toISOString() })
    .eq("contact_id", contactId)
    .eq("source", FAIL_TASK_SOURCE)
    .eq("completed", false);
  if (error) log.warn("yla.fail_task_close_failed", { contactId, error: error.message });
}

export type FailReport = { alerted: boolean; task: "created" | "updated" | "skipped" };

export async function reportVerificationFailure(opts: {
  siblings: Sibling[];
  contactId: string | null;
  opportunityId: string | null;
  clientRef: string | null;
  docs: DocVerdict[];
  missing: string[];
  fixups: FixupAction[];
  now: Date;
}): Promise<FailReport> {
  const applicants = groupFailuresByApplicant(opts.siblings, opts.docs, opts.fixups);
  const household = householdName(opts.siblings.map((s) => s.applicant_name || ""));
  const crmUrl = opts.opportunityId ? `${origin()}/opportunities/${opts.opportunityId}` : `${origin()}/document-requests`;
  const report: FailReport = { alerted: false, task: "skipped" };

  const mail = buildFailAlert({
    household,
    clientRef: opts.clientRef,
    applicants,
    missing: opts.missing,
    crmUrl,
    verifiedAt: opts.now,
  });
  try {
    const res = await sendBrevoEmail({
      to: failAlertRecipients().map((email) => ({ email })),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: URGENT_HEADERS,
      tags: ["yla-verification-failed"],
    });
    report.alerted = res.ok;
    if (!res.ok) log.error("yla.fail_alert_failed", { clientRef: opts.clientRef, error: res.error });
  } catch (e) {
    log.error("yla.fail_alert_failed", { clientRef: opts.clientRef, error: e instanceof Error ? e.message : String(e) });
  }

  if (opts.contactId) {
    try {
      report.task = await upsertFailTask({
        contactId: opts.contactId,
        title: mail.subject,
        body: buildFailTaskBody({ applicants, missing: opts.missing, verifiedAt: opts.now }),
        now: opts.now,
      });
    } catch (e) {
      log.error("yla.fail_task_failed", { clientRef: opts.clientRef, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
