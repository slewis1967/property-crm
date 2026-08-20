/**
 * Sending a document out for e-signature, in one place.
 *
 * Two callers with different auth and no other overlap: the advisor route
 * (POST /api/signature-requests, behind Cloudflare Access) and a Tier 2
 * introducer submitting a full pack (behind an introducer session cookie).
 * Same reasoning as utils/document-requests-create.ts — they cannot share a
 * route, so they share this.
 *
 * TWO BEHAVIOURS HERE ARE LOAD-BEARING, both learned the hard way:
 *
 *   1. THE EMAIL IS THE ACTION. A signature request whose email Brevo rejected
 *      is not a sent request, it is a row that will sit at "sent" forever while
 *      the signer waits for a link that never arrived. So a send failure rolls
 *      back the rows it created and reports, rather than leaving a stuck record.
 *
 *   2. ALL OR NOTHING ACROSS SIGNERS. A joint document signed by one of two
 *      people is not partially signed, it is unusable — and yla-package.ts
 *      refuses the whole submission over it. Half-sending would strand the pack
 *      in a state nobody can clear without deleting rows by hand.
 *
 * The raw token exists only in the emailed link. Only its SHA-256 is stored, so
 * a database leak yields nothing replayable.
 */
import { supabase } from "./supabase";
import { newToken } from "./sign-token";
import { sendBrevoEmail } from "./brevo";
import { recordAudit } from "./compliance-audit";
import { resolveIdentity } from "./mailIdentities";
import { log, errInfo } from "./logger";
import { DOC_TYPE_LABEL } from "./signatures";
import type { ComplianceDocType } from "./compliance-audit";
import {
  SIGNATURE_REQUESTS_TABLE,
  SIGNATURE_MIGRATION_HINT,
  signatureTableMissing,
  isValidEmail,
} from "./signature-requests-db";

const TEAL = "#0F4C5C";
export const MAX_SIGNERS = 2;
export const DEFAULT_EXPIRY_DAYS = 14;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function signEmailHtml(
  signerName: string,
  docLabel: string,
  link: string,
  message: string,
): string {
  const greeting = signerName ? `Hi ${escapeHtml(signerName)},` : "Hello,";
  const note = message ? `<p style="margin:0 0 16px">${escapeHtml(message)}</p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <div style="background:${TEAL};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
      <div style="font-size:18px;font-weight:bold">NextKey Property Strategists</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">You've been asked to review and electronically sign your <strong>${escapeHtml(docLabel)}</strong>.</p>
      ${note}
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:${TEAL};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">
          Review &amp; sign
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:12px;color:#555">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:12px;word-break:break-all"><a href="${link}" style="color:${TEAL}">${link}</a></p>
      <p style="margin:0;font-size:12px;color:#888">This link is unique to you — please don't forward it. If you weren't expecting this, you can ignore this email.</p>
    </div>
  </div>`;
}

export type Signer = { name: string; email: string };

export type CreateSignatureRequestsInput = {
  docType: ComplianceDocType;
  docId: string;
  signers: Signer[];
  /** Origin the signing link is built from — see publicOrigin(). */
  origin: string;
  message?: string;
  expiresInDays?: number;
  /** CF-Access email, or the introducer's email. Whoever asked for the signature. */
  createdBy: string;
  /** Label for the email subject/body. Defaults to the doc type's own name. */
  docLabel?: string;
};

export type CreateSignatureRequestsResult =
  | { ok: true; requests: { id: string; signer_index: number; signer_email: string; status: string }[] }
  | { ok: false; error: string; status: number };

export async function createSignatureRequests(
  input: CreateSignatureRequestsInput,
): Promise<CreateSignatureRequestsResult> {
  const signers = input.signers.slice(0, MAX_SIGNERS);
  if (signers.length === 0) {
    return { ok: false, error: "At least one signer is required", status: 400 };
  }
  for (const s of signers) {
    if (!isValidEmail(s.email)) {
      return { ok: false, error: `Invalid signer email: ${s.email || "(blank)"}`, status: 400 };
    }
  }

  const docLabel = input.docLabel ?? DOC_TYPE_LABEL[input.docType];
  const days =
    typeof input.expiresInDays === "number" && input.expiresInDays > 0 && input.expiresInDays <= 90
      ? Math.floor(input.expiresInDays)
      : DEFAULT_EXPIRY_DAYS;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  /* Springboard branding, not NextKey's, and not a hardcoded address:
   * hello@springboardhomes.com.au is an already-validated Brevo sender, so the
   * mail actually delivers. Resolved through the composer's identity so it
   * stays in step with env config. */
  const sender = resolveIdentity("springboard");
  const message = (input.message ?? "").slice(0, 1000);

  const created: { id: string; signer_index: number; signer_email: string; status: string }[] = [];
  const createdIds: string[] = [];
  const emailErrors: string[] = [];

  for (let i = 0; i < signers.length; i++) {
    const { raw, hash } = newToken();
    const { data: inserted, error } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .insert({
        doc_type: input.docType,
        doc_id: input.docId,
        signer_index: i + 1,
        signer_name: signers[i].name || null,
        signer_email: signers[i].email,
        token_hash: hash,
        status: "sent",
        created_by: input.createdBy,
        sent_at: now.toISOString(),
        expires_at: expiresAt,
      })
      .select("id,signer_index,signer_email,status")
      .single();

    if (error) {
      if (signatureTableMissing(error)) {
        return { ok: false, error: SIGNATURE_MIGRATION_HINT, status: 501 };
      }
      log.error("sign.insert_failed", { docType: input.docType, docId: input.docId, ...errInfo(error) });
      emailErrors.push(`${signers[i].email}: could not create the request`);
      break;
    }

    const row = inserted as { id: string; signer_index: number; signer_email: string; status: string };
    createdIds.push(row.id);

    const sent = await sendBrevoEmail({
      to: [{ email: signers[i].email, name: signers[i].name || undefined }],
      subject: `Please sign your ${docLabel}`,
      html: signEmailHtml(signers[i].name, docLabel, `${input.origin}/sign/${raw}`, message),
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      tags: ["e-signature"],
    });
    if (!sent.ok) {
      // The email IS the action — a rejected send must not be reported as
      // success. Record it and skip the "sent" audit for this signer.
      emailErrors.push(`${signers[i].email}: ${sent.error}`);
      continue;
    }

    created.push(row);

    // Audit on the document itself. The audit action enum has no "sent" value,
    // so log an 'update' with a clear note (per the compliance-audit contract).
    await recordAudit({
      docType: input.docType,
      docId: input.docId,
      action: "update",
      changedBy: input.createdBy,
      note: `Sent for signature to ${signers[i].email}`,
    });
  }

  if (emailErrors.length) {
    /* Roll back every row this call created, including ones whose own email
     * succeeded. A document signed by one of two people is not partially
     * signed — yla-package.ts refuses the whole submission over it — so
     * leaving one live request behind would strand the document in a state
     * nobody can clear without deleting rows by hand. A clean retry is the
     * only useful outcome. */
    if (createdIds.length) {
      const { error: delErr } = await supabase
        .from(SIGNATURE_REQUESTS_TABLE)
        .delete()
        .in("id", createdIds);
      if (delErr) {
        log.error("sign.cleanup_after_email_failure_failed", {
          docType: input.docType,
          docId: input.docId,
          ...errInfo(delErr),
        });
      }
    }
    log.warn("sign.email_send_failed", {
      docType: input.docType,
      docId: input.docId,
      errors: emailErrors,
    });
    return {
      ok: false,
      error: `Could not send for signature: ${emailErrors.join("; ")}`,
      status: 502,
    };
  }

  return { ok: true, requests: created };
}
