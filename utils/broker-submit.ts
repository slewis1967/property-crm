/**
 * Submit a completed + verified document set to a BROKER — the broker analog of
 * the YLA .ics submission. Emails the broker the client's Fact Find PDF (the
 * newest completed one for the contact, if any) plus the Drive folder link to
 * the verified documents. Used by the auto-submit sweep when an application's
 * destination is a broker.
 */
import { supabase } from "./supabase";
import { applicantSummary, factFindCompletionBlockers, hydrateFactFind, type FactFindData } from "./factfind";
import { renderFactFindHtml } from "./pdf/factFindPdf";
import { htmlToPdf } from "./pdf/render";
import { sendBrevoEmail } from "./brevo";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Newest COMPLETE Fact Find for a contact, rendered to PDF base64. null if none. */
async function contactFactFindPdf(contactId: string | null): Promise<{ base64: string; applicant: string } | null> {
  if (!contactId) return null;
  const { data } = await supabase
    .from("borrower_fact_finds")
    .select("data")
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ff = hydrateFactFind((data as { data: unknown }).data) as FactFindData;
  if (factFindCompletionBlockers(ff).length) return null; // stub — don't attach
  try {
    const pdf = await htmlToPdf(await renderFactFindHtml(ff));
    return { base64: Buffer.from(pdf).toString("base64"), applicant: applicantSummary(ff) || "Applicant" };
  } catch {
    return null;
  }
}

export type BrokerSubmitResult = { ok: boolean; error?: string; factFindIncluded: boolean };

export async function submitApplicationToBroker(args: {
  brokerName: string;
  brokerEmail: string;
  brokerReference: string | null;
  contactId: string | null;
  primaryApplicant: string;
  driveUrl: string;
}): Promise<BrokerSubmitResult> {
  const ff = await contactFactFindPdf(args.contactId);
  const applicant = ff?.applicant || args.primaryApplicant || "Applicant";
  const greet = args.brokerName.split(/\s+/)[0] || "there";
  const ref = args.brokerReference ? ` [${args.brokerReference}]` : "";
  const refLine = args.brokerReference ? `Reference: ${args.brokerReference}` : "";

  const attachments = ff ? [{ name: "fact-find.pdf", content: ff.base64 }] : undefined;
  const factFindNote = ff
    ? "The client's Fact Find is attached, and their supporting documents are in the Drive folder below."
    : "The client's supporting documents are in the Drive folder below.";

  const subject = `New lead — ${applicant}${ref}`;
  const text = [
    `Hi ${greet},`,
    ``,
    `New lead ready for assessment: ${applicant}.`,
    factFindNote,
    ``,
    `Documents: ${args.driveUrl}`,
    refLine,
    ``,
    `Any questions, just reply.`,
  ].filter((l) => l !== "").join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px">
    <p>Hi ${escapeHtml(greet)},</p>
    <p>New lead ready for assessment: <strong>${escapeHtml(applicant)}</strong>.</p>
    <p>${escapeHtml(factFindNote)}</p>
    <p><a href="${args.driveUrl}">Open the documents (Google Drive)</a></p>
    ${args.brokerReference ? `<p style="font-size:13px;color:#555">Reference: ${escapeHtml(args.brokerReference)}</p>` : ""}
    <p style="font-size:13px;color:#555">Any questions, just reply.</p>
  </div>`;

  const res = await sendBrevoEmail({
    to: [{ email: args.brokerEmail, name: args.brokerName }],
    subject,
    html,
    text,
    attachments,
    tags: ["broker-doc-submission"],
  });
  return { ok: res.ok, error: res.ok ? undefined : res.error, factFindIncluded: !!ff };
}
