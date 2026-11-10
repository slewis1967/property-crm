/**
 * Submit a completed Fact Find to a broker — the Fact Find analog of the YLA
 * flow (verify → package → send), but the "document" is the Fact Find itself and
 * the destination is a broker chosen from Settings.
 *
 * Gate: the Fact Find must pass the completion check (factFindCompletionBlockers)
 * — no stub goes to a broker. Package: the server-rendered Fact Find PDF (same
 * renderer as the download). Send: emailed to the broker with the PDF attached.
 * Records each send in broker_submissions.
 */
import { supabase } from "./supabase";
import {
  applicantSummary,
  factFindCompletionBlockers,
  hydrateFactFind,
  factFindsTableMissing,
} from "./factfind";
import { getBroker } from "./brokers";
import { renderFactFindHtml } from "./pdf/factFindPdf";
import { htmlToPdf } from "./pdf/render";
import { sendBrevoEmail } from "./brevo";

const TABLE = "borrower_fact_finds";

export type BrokerSubmitResult =
  | { ok: false; status: number; error: string; blockers?: string[] }
  | { ok: true; brokerName: string; brokerEmail: string; applicant: string };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function submitFactFindToBroker(
  factFindId: string,
  brokerId: string,
  submittedBy: string | null,
): Promise<BrokerSubmitResult> {
  // 1. Load the Fact Find.
  const { data: row, error } = await supabase.from(TABLE).select("*").eq("id", factFindId).maybeSingle();
  if (error) {
    if (factFindsTableMissing(error)) return { ok: false, status: 501, error: "Fact Find storage isn't set up yet." };
    return { ok: false, status: 500, error: error.message };
  }
  if (!row) return { ok: false, status: 404, error: "Fact Find not found" };
  const data = hydrateFactFind((row as Record<string, unknown>).data);

  // 2. Verify complete (the gate — no stub to a broker).
  const blockers = factFindCompletionBlockers(data);
  if (blockers.length) {
    return { ok: false, status: 422, error: `Fact Find isn't complete — still needed: ${blockers.join(", ")}.`, blockers };
  }

  // 3. Resolve the broker.
  const broker = await getBroker(brokerId);
  if (!broker) return { ok: false, status: 404, error: "Broker not found — check Settings → Brokers." };
  if (!broker.active) return { ok: false, status: 409, error: `${broker.name} is marked inactive in Settings.` };

  // 4. Package: render the Fact Find PDF.
  const applicant = applicantSummary(data) || "Applicant";
  let pdfBase64: string;
  try {
    const html = await renderFactFindHtml(data);
    const pdf = await htmlToPdf(html);
    pdfBase64 = Buffer.from(pdf).toString("base64");
  } catch (e) {
    return { ok: false, status: 500, error: `Could not generate the Fact Find PDF: ${e instanceof Error ? e.message : "render error"}` };
  }

  // 5. Send to the broker.
  const ref = broker.reference ? ` [${broker.reference}]` : "";
  const subject = `Fact Find — ${applicant}${ref}`;
  const greetingName = broker.name.split(/\s+/)[0] || "there";
  const text = [
    `Hi ${greetingName},`,
    ``,
    `Please find attached the Fact Find for ${applicant}.`,
    broker.reference ? `Reference: ${broker.reference}` : "",
    ``,
    `Any questions, just reply.`,
  ].filter((l) => l !== "").join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px">
    <p>Hi ${escapeHtml(greetingName)},</p>
    <p>Please find attached the Fact Find for <strong>${escapeHtml(applicant)}</strong>.</p>
    ${broker.reference ? `<p style="font-size:13px;color:#555">Reference: ${escapeHtml(broker.reference)}</p>` : ""}
    <p style="font-size:13px;color:#555">Any questions, just reply.</p>
  </div>`;

  const safe = applicant.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || factFindId;
  const emailRes = await sendBrevoEmail({
    to: [{ email: broker.email, name: broker.name }],
    subject,
    html,
    text,
    attachments: [{ name: `fact-find-${safe}.pdf`, content: pdfBase64 }],
    tags: ["broker-submission"],
  });
  if (!emailRes.ok) return { ok: false, status: 502, error: `Could not email the broker: ${emailRes.error}` };

  // 6. Record the submission (best-effort — the email already went, so a missing
  // table or write error must never surface as a failure here).
  await supabase.from("broker_submissions").insert({
    fact_find_id: factFindId,
    broker_id: broker.id,
    broker_name: broker.name,
    broker_email: broker.email,
    reference: broker.reference,
    submitted_by: submittedBy,
  });

  return { ok: true, brokerName: broker.name, brokerEmail: broker.email, applicant };
}
