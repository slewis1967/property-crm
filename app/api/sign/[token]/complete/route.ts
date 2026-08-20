/**
 * PUBLIC signing completion — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * POST /api/sign/[token]/complete
 *   Body: { signature_image (base64 PNG data URI), typed_name?, consent:true }
 *
 *   Records the signature + the ETA-1999 evidence (IP, user-agent, consent + sign
 *   timestamps) on this signer's request, then GENERATES THE SIGNED PDF
 *   SERVER-SIDE from the stored document data (a client can never submit its own
 *   PDF), stores it privately, and — when every signer has completed — locks the
 *   underlying document (its terminal status) and records the `sign` audit. The
 *   signed PDF is emailed to the signer and the advisor.
 *
 * INTERNET-FACING — treat every input as hostile. Rate-limited; generic errors.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { log } from "../../../../../utils/logger";
import {
  isTerminalStatus,
  isExpired,
  allSigned,
  buildSignaturesArray,
  DOC_TYPE_LABEL,
  type SignerLike,
} from "../../../../../utils/signatures";
import {
  SIGNATURE_REQUESTS_TABLE,
  findRequestByToken,
} from "../../../../../utils/signature-requests-db";
import { loadDoc, markDocSigned } from "../../../../../utils/sign-doc-render";
import { advanceApplicationOnNdaSigned } from "../../../../../utils/introducer-nda";
import { htmlToPdf } from "../../../../../utils/pdf/render";
import { sendBrevoEmail } from "../../../../../utils/brevo";
import { resolveIdentity } from "../../../../../utils/mailIdentities";
import { signBrandStyle } from "../../../../../utils/sign-brand";
import { clientIp, rateKeyFromToken } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "signed-documents";
const PNG_PREFIX = "data:image/png;base64,";
const MAX_SIGNATURE_BYTES = 3 * 1024 * 1024; // 3MB of base64 — a signature PNG is tiny
const SIGNED_URL_TTL = 60 * 60; // 1 hour — long enough for Brevo to fetch on send
const TEAL = "#0F4C5C";

/** True for a well-formed, size-bounded base64 PNG data URI. */
function isPngDataUri(v: unknown): v is string {
  if (typeof v !== "string" || !v.startsWith(PNG_PREFIX)) return false;
  if (v.length > MAX_SIGNATURE_BYTES) return false;
  const b64 = v.slice(PNG_PREFIX.length);
  return b64.length > 0 && /^[A-Za-z0-9+/=]+$/.test(b64);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 10, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      signature_image?: unknown;
      typed_name?: unknown;
      consent?: unknown;
    };

    if (body.consent !== true) {
      return NextResponse.json({ ok: false, error: "Consent is required to sign." }, { status: 400 });
    }
    if (!isPngDataUri(body.signature_image)) {
      return NextResponse.json({ ok: false, error: "A valid signature is required." }, { status: 400 });
    }

    const found = await findRequestByToken(token);
    if (!found.ok) {
      return NextResponse.json({ ok: false, error: "This signing link is no longer valid." }, { status: 400 });
    }
    const row = found.row;

    if (row.status === "signed") {
      return NextResponse.json({ ok: false, error: "This document has already been signed." }, { status: 409 });
    }
    if (row.status === "declined" || row.status === "expired" || isExpired(row.expires_at, Date.now())) {
      return NextResponse.json({ ok: false, error: "This signing link is no longer valid." }, { status: 400 });
    }
    if (isTerminalStatus(row.status)) {
      return NextResponse.json({ ok: false, error: "This signing link is no longer valid." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const typedName = typeof body.typed_name === "string" ? body.typed_name.trim().slice(0, 120) : "";
    const signerName = row.signer_name || typedName || null;

    // Persist the signature + evidence. Guard with `.neq('status','signed')` so a
    // concurrent double-submit can't overwrite an already-completed signature.
    const { data: updated, error: updErr } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .update({
        status: "signed",
        signer_name: signerName,
        signature_image: body.signature_image,
        signer_ip: clientIp(req),
        signer_user_agent: (req.headers.get("user-agent") || "").slice(0, 500),
        consent_at: now,
        signed_at: now,
      })
      .eq("id", row.id)
      .neq("status", "signed")
      .select("id")
      .maybeSingle();
    if (updErr) throw updErr;
    if (!updated) {
      return NextResponse.json({ ok: false, error: "This document has already been signed." }, { status: 409 });
    }

    // Gather every signed signature for this document (incl. the one just saved)
    // and render the SIGNED PDF server-side from the stored document data.
    const { data: allRows, error: allErr } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .select("signer_index,signer_name,signature_image,signed_at,status")
      .eq("doc_type", row.doc_type)
      .eq("doc_id", row.doc_id);
    if (allErr) throw allErr;
    const signerRows = (allRows ?? []) as SignerLike[];
    const signatures = buildSignaturesArray(signerRows);

    const doc = await loadDoc(row.doc_type, row.doc_id);
    if (!doc) {
      // The signature is saved; we just can't render right now. Report success so
      // the signer isn't blocked — the PDF can be regenerated by the advisor.
      log.error("sign.complete_doc_missing", { docType: row.doc_type, docId: row.doc_id });
      return NextResponse.json({ ok: true, warning: "Signed, but the document copy could not be generated." });
    }

    const html = await doc.renderHtml(signatures);
    const pdf = new Uint8Array(await htmlToPdf(html));

    const path = `signed/${row.doc_type}/${row.doc_id}/${row.id}.pdf`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      log.error("sign.complete_upload_failed", { message: upErr.message, path });
    } else {
      await supabase
        .from(SIGNATURE_REQUESTS_TABLE)
        .update({ signed_pdf_path: path })
        .eq("id", row.id);
    }

    // When every signer has completed, lock the underlying document + audit it.
    if (allSigned(signerRows)) {
      await markDocSigned(row.doc_type, row.doc_id, `signer:${row.signer_email}`);

      // A signed NDA is the gate on step one of introducer onboarding. Until the
      // application moves off `invited`, the applicant's page keeps offering the
      // agreement they just signed and never opens the ID upload.
      //
      // Best-effort on purpose: the signature is already durably recorded, so a
      // failure here must not turn a completed signing into a 500 and invite
      // them to sign a second time. It surfaces in the log, and staff can
      // advance the application by hand.
      if (row.doc_type === "introducer_nda") {
        try {
          await advanceApplicationOnNdaSigned(row.doc_id, row.signer_email);
        } catch (e) {
          log.error("sign.introducer_nda_advance_failed", {
            docId: row.doc_id,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    // Email the signed copy to the signer and the advisor (best-effort).
    await emailSignedCopy(
      row.doc_type,
      row.signer_email,
      row.created_by,
      path,
      upErr ? null : true,
      row.brand,
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("sign.complete_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return NextResponse.json({ ok: false, error: "Could not complete signing. Please try again." }, { status: 500 });
  }
}

/**
 * Email the signed PDF (as a short-lived signed-URL attachment) to the signer and
 * the advisor. Best-effort — a mail failure must not fail the signing.
 */
async function emailSignedCopy(
  docType: string,
  signerEmail: string,
  advisorEmail: string | null,
  path: string,
  uploaded: boolean | null,
  brand?: string | null,
): Promise<void> {
  /* The brand the signer actually saw when they signed. This email used to send
   * from the Springboard sender under a NextKey letterhead — half-converted, and
   * confusing for whichever client received it. */
  const brandStyle = signBrandStyle(brand);
  const label = DOC_TYPE_LABEL[docType as keyof typeof DOC_TYPE_LABEL] ?? "document";
  let attachments: { name: string; url: string }[] | undefined;
  if (uploaded) {
    const { data } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL, { download: `signed-${docType}.pdf` });
    if (data?.signedUrl) attachments = [{ name: `signed-${docType}.pdf`, url: data.signedUrl }];
  }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <div style="background:${TEAL};color:#fff;padding:16px 20px;font-weight:bold">NextKey Property Strategists</div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:20px">
      <p>Your <strong>${label}</strong> has been signed electronically. A copy is attached for your records.</p>
      <p style="font-size:12px;color:#888">Signed under the Electronic Transactions Act 1999.</p>
    </div>
  </div>`;

  // Same identity as the "send for signature" request email, so the signed copy
  // arrives from the address the signer already heard from. Best-effort.
  const sender = resolveIdentity(brandStyle.identity);
  const recipients = [signerEmail, advisorEmail].filter((e): e is string => !!e);
  for (const to of recipients) {
    const res = await sendBrevoEmail({
      to: [{ email: to }],
      subject: `Your signed ${label}`,
      html,
      attachments,
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      tags: ["e-signature", "signed-copy"],
    });
    if (!res.ok) log.warn("sign.signed_copy_email_failed", { to, error: res.error });
  }
}
