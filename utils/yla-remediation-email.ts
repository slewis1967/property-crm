/**
 * Client document-fixup emails — the automatic "please re-upload these in the
 * right format" message sent to a client when their uploaded set FAILS
 * verification (e.g. an ATO statement that's a phone screenshot). Fired from the
 * YLA auto-submit sweep's flag path, so a rejected set doesn't just sit flagged
 * for the rep — the client is told exactly what to fix, with a fresh upload link.
 *
 * De-dup is inherited from the sweep: it only re-verifies (and so only re-emails)
 * a failed set once the client uploads something new, so a static broken set
 * isn't nagged every 2 hours.
 *
 * SAFETY: nothing sends unless CLIENT_DOC_FIXUP_ENABLED === "true". Otherwise
 * every call is a dry run that reports who WOULD be emailed and why. Mirrors the
 * reminders + YLA-autosubmit gates.
 *
 * Reuses the document-portal machinery: a fresh rotated token per send (via
 * newToken, expiring older links) and Brevo for delivery, logged to
 * document_reminder_log with kind "fixup".
 */
import { supabase } from "./supabase";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";
import { DOC_BY_KEY } from "./yla-documents";
import { newToken } from "./sign-token";
import { sendBrevoEmail } from "./brevo";
import type { DocVerdict } from "./yla-verification";

export function clientDocFixupEnabled(): boolean {
  return process.env.CLIENT_DOC_FIXUP_ENABLED === "true";
}

function origin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}
function fromName(): string {
  return process.env.BREVO_SENDER_NAME || "NextKey";
}
function replyTo(): string | undefined {
  return process.env.BREVO_REPLY_TO || undefined;
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function firstNameOf(name: string | null): string {
  const n = (name || "").trim().split(/\s+/)[0];
  return n || "there";
}

/** How to obtain a proper version of each document — the difference between a
 * good upload and another rejection. Keyed by client_documents.doc_type. */
const FIX_GUIDANCE: Record<string, string> = {
  payslip: "Download the PDF payslips from your payroll/employer system rather than taking a screenshot.",
  photo_id: "A clear image of your licence — both the front and the back.",
  ato_income:
    "Download the official PDF from myGov (ATO → Income statement) for the relevant financial year. A screenshot of the screen won't be accepted — use the Save-as-PDF / download option.",
  super_statement: "Your most recent super statement as a PDF, from myGov or your fund's website.",
};

export type FixupAction =
  | { requestId: string; applicant: string; action: "emailed" | "would_email"; to: string; docs: string[] }
  | { requestId: string; applicant: string; action: "skipped"; reason: string };

type Sibling = {
  id: string;
  applicant_name: string | null;
  applicant_email: string | null;
  created_at: string | null;
};

/** Which of an application's flagged docs belong to a given sibling index.
 * Multi-applicant verdicts are labelled "Applicant N" (1-based, in created_at
 * order); a solo application labels by name, so all flagged docs are the one
 * applicant's. */
function flaggedForSibling(
  failed: DocVerdict[],
  siblingIndex: number,
  soloApplicant: boolean,
): DocVerdict[] {
  if (soloApplicant) return failed;
  const label = `Applicant ${siblingIndex + 1}`;
  return failed.filter((d) => d.applicant === label);
}

function renderFixup(opts: { applicantName: string | null; link: string; flagged: DocVerdict[] }): {
  subject: string;
  html: string;
  text: string;
} {
  const first = firstNameOf(opts.applicantName);
  const rows = opts.flagged.map((d) => {
    const label = DOC_BY_KEY[d.docKey]?.label || d.docKey.replace(/_/g, " ");
    const why = d.issues.length ? d.issues.join("; ") : "needs to be re-supplied";
    const how = FIX_GUIDANCE[d.docKey] || "Please re-upload this as a clear PDF.";
    return { label, why, how };
  });

  const subject = "NextKey — a quick fix on your uploaded documents";

  const htmlRows = rows
    .map(
      (r) =>
        `<li style="margin:0 0 12px"><strong>${escapeHtml(r.label)}</strong> — ${escapeHtml(r.why)}.<br>` +
        `<span style="color:#555">${escapeHtml(r.how)}</span></li>`,
    )
    .join("");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#222;line-height:1.5">
    <p>Hi ${escapeHtml(first)},</p>
    <p>Thanks for uploading your documents — you're almost there. Our lending partner reviews everything to bank standard, and a couple of files need to be re-supplied in the right format before we can put your application forward:</p>
    <ul style="padding-left:20px">${htmlRows}</ul>
    <p style="margin:20px 0">
      <a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">Re-upload your documents</a>
    </p>
    <p style="font-size:13px;color:#555">Or paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(opts.link)}</span></p>
    <p>Getting these in as PDFs is the last step before we can move you forward. Any questions, just reply to this email.</p>
    <p>Kind regards,<br>${escapeHtml(fromName())}</p>
  </div>`;

  const textRows = rows.map((r) => `• ${r.label} — ${r.why}. ${r.how}`).join("\n");
  const text = `Hi ${first},

Thanks for uploading your documents — you're almost there. A couple of files need to be re-supplied in the right format before we can put your application forward:

${textRows}

Re-upload here: ${opts.link}

Getting these in as PDFs is the last step before we can move you forward. Any questions, just reply to this email.

Kind regards,
${fromName()}`;

  return { subject, html, text };
}

/**
 * Send fixup emails for one FAILED application. `docs` is the full verdict set
 * (only the failing ones are used). Returns per-recipient actions; sends nothing
 * (dryRun reporting only) unless the gate is on.
 */
export async function sendClientDocFixups(opts: {
  applicationId: string | null;
  repId: string;
  docs: DocVerdict[];
  now: Date;
  dryRun?: boolean;
}): Promise<FixupAction[]> {
  const dryRun = opts.dryRun ?? !clientDocFixupEnabled();
  const failed = opts.docs.filter((d) => !d.pass);
  if (failed.length === 0) return [];

  // The applicant requests for this application, oldest first (matches the
  // "Applicant N" numbering the verification uses).
  let siblings: Sibling[];
  if (opts.applicationId) {
    const { data } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,applicant_name,applicant_email,created_at")
      .eq("application_id", opts.applicationId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    siblings = (data ?? []) as Sibling[];
  } else {
    const { data } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,applicant_name,applicant_email,created_at")
      .eq("id", opts.repId)
      .maybeSingle();
    siblings = data ? [data as Sibling] : [];
  }
  if (siblings.length === 0) return [];
  const solo = siblings.length === 1;

  const actions: FixupAction[] = [];
  for (let i = 0; i < siblings.length; i++) {
    const sib = siblings[i]!;
    const mine = flaggedForSibling(failed, i, solo);
    if (mine.length === 0) continue; // this applicant's docs all passed
    const to = (sib.applicant_email || "").trim();
    if (!to) {
      actions.push({ requestId: sib.id, applicant: sib.applicant_name || "Applicant", action: "skipped", reason: "no email" });
      continue;
    }
    const docLabels = mine.map((d) => DOC_BY_KEY[d.docKey]?.label || d.docKey);

    if (dryRun) {
      actions.push({ requestId: sib.id, applicant: sib.applicant_name || "Applicant", action: "would_email", to, docs: docLabels });
      continue;
    }

    // Fresh rotated link (expires any older one), same as the reminder engine.
    const t = newToken();
    const link = `${origin()}/portal/${t.raw}`;
    const rendered = renderFixup({ applicantName: sib.applicant_name, link, flagged: mine });
    const res = await sendBrevoEmail({
      to: [{ email: to, name: sib.applicant_name || undefined }],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      replyTo: replyTo(),
      fromName: fromName(),
      tags: ["client-doc-fixup"],
      commercial: true, // automated; honour email opt-out (Spam Act)
    });
    await supabase.from("document_reminder_log").insert({
      request_id: sib.id, kind: "fixup", channel: "email", recipient: to,
      status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, dry_run: false,
    });
    if (res.ok) {
      // Persist the rotated token so the emailed link is the one that works.
      await supabase
        .from(DOCUMENT_REQUESTS_TABLE)
        .update({ token_hash: t.hash, updated_at: opts.now.toISOString() })
        .eq("id", sib.id);
      actions.push({ requestId: sib.id, applicant: sib.applicant_name || "Applicant", action: "emailed", to, docs: docLabels });
    } else {
      actions.push({ requestId: sib.id, applicant: sib.applicant_name || "Applicant", action: "skipped", reason: `send failed: ${res.error}` });
    }
  }
  return actions;
}
