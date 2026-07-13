/**
 * Advisor-side signature-request management (AUTHED — behind Cloudflare Access).
 *
 *   POST /api/signature-requests
 *     Body: { doc_type, doc_id, signers:[{name,email}], message?, expiresInDays? }
 *     Creates one signature_requests row per signer with a FRESH one-time token
 *     (only the SHA-256 hash is stored), emails each signer a `/sign/<raw-token>`
 *     link via Brevo, and records a "sent for signature" audit entry on the
 *     document. Returns the created requests WITHOUT the raw tokens.
 *
 *   GET /api/signature-requests?doc_type=&doc_id=
 *     Lists a document's requests for the signing status panel — PII-safe columns
 *     only (never token_hash, signature_image, or the IP/UA evidence).
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { enforceRateLimit } from "../../../utils/rate-limit";
import { log, errInfo } from "../../../utils/logger";
import { recordAudit } from "../../../utils/compliance-audit";
import { newToken } from "../../../utils/sign-token";
import { isSignDocType } from "../../../utils/signatures";
import { loadDoc } from "../../../utils/sign-doc-render";
import { sendBrevoEmail } from "../../../utils/brevo";
import {
  SIGNATURE_REQUESTS_TABLE,
  SIGNATURE_MIGRATION_HINT,
  signatureTableMissing,
  isValidEmail,
  isUuid,
  LIST_COLUMNS,
} from "../../../utils/signature-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIGNERS = 2;
const DEFAULT_EXPIRY_DAYS = 14;
const TEAL = "#0F4C5C";

/**
 * The public origin to build signing links from. Prefer an explicit env
 * (PUBLIC_APP_URL) so links are always the customer-facing host; otherwise derive
 * from the forwarded host headers Cloudflare/Netlify set.
 */
function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function signEmailHtml(signerName: string, docLabel: string, link: string, message: string): string {
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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Guard against a runaway loop or abuse spraying signing emails.
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20 });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as {
      doc_type?: unknown;
      doc_id?: unknown;
      signers?: unknown;
      message?: unknown;
      expiresInDays?: unknown;
    };

    if (!isSignDocType(body.doc_type)) {
      return NextResponse.json({ ok: false, error: "Invalid doc_type" }, { status: 400 });
    }
    if (!isUuid(body.doc_id)) {
      return NextResponse.json({ ok: false, error: "Invalid doc_id" }, { status: 400 });
    }
    const docType = body.doc_type;
    const docId = body.doc_id;

    const rawSigners = Array.isArray(body.signers) ? body.signers : [];
    const signers = rawSigners
      .slice(0, MAX_SIGNERS)
      .map((s) => s as { name?: unknown; email?: unknown })
      .map((s) => ({
        name: typeof s.name === "string" ? s.name.trim() : "",
        email: typeof s.email === "string" ? s.email.trim() : "",
      }));
    if (signers.length === 0) {
      return NextResponse.json({ ok: false, error: "At least one signer is required" }, { status: 400 });
    }
    for (const s of signers) {
      if (!isValidEmail(s.email)) {
        return NextResponse.json({ ok: false, error: `Invalid signer email: ${s.email || "(blank)"}` }, { status: 400 });
      }
    }

    // Validate the document exists (also gives us a label for the email).
    const doc = await loadDoc(docType, docId);
    if (!doc) {
      return NextResponse.json({ ok: false, error: "Document not found" }, { status: 404 });
    }
    const docLabel = documentLabel(docType, doc.summary);

    const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";
    const days =
      typeof body.expiresInDays === "number" && body.expiresInDays > 0 && body.expiresInDays <= 90
        ? Math.floor(body.expiresInDays)
        : DEFAULT_EXPIRY_DAYS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const origin = publicOrigin(req);

    const created: { id: string; signer_index: number; signer_email: string; status: string }[] = [];
    const emailErrors: string[] = [];

    for (let i = 0; i < signers.length; i++) {
      const { raw, hash } = newToken();
      const { data: inserted, error } = await supabase
        .from(SIGNATURE_REQUESTS_TABLE)
        .insert({
          doc_type: docType,
          doc_id: docId,
          signer_index: i + 1,
          signer_name: signers[i].name || null,
          signer_email: signers[i].email,
          token_hash: hash,
          status: "sent",
          created_by: auth,
          sent_at: now.toISOString(),
          expires_at: expiresAt,
        })
        .select("id,signer_index,signer_email,status")
        .single();

      if (error) {
        if (signatureTableMissing(error)) {
          return NextResponse.json({ ok: false, error: SIGNATURE_MIGRATION_HINT }, { status: 501 });
        }
        throw error;
      }

      const link = `${origin}/sign/${raw}`;
      const sent = await sendBrevoEmail({
        to: [{ email: signers[i].email, name: signers[i].name || undefined }],
        subject: `Please sign your ${docLabel}`,
        html: signEmailHtml(signers[i].name, docLabel, link, message),
        tags: ["e-signature"],
      });
      if (!sent.ok) emailErrors.push(`${signers[i].email}: ${sent.error}`);

      created.push(inserted as { id: string; signer_index: number; signer_email: string; status: string });

      // Audit on the document itself. The audit action enum has no "sent" value,
      // so log an 'update' with a clear note (per the compliance-audit contract).
      await recordAudit({
        docType,
        docId,
        action: "update",
        changedBy: auth,
        note: `Sent for signature to ${signers[i].email}`,
      });
    }

    if (emailErrors.length) {
      // Rows were created; surface the email failure so the advisor can resend,
      // rather than silently pretending everything went out.
      log.warn("sign.email_send_failed", { docType, docId, errors: emailErrors });
      return NextResponse.json({
        ok: true,
        requests: created,
        warning: `Requests created, but some emails failed to send: ${emailErrors.join("; ")}`,
      });
    }

    return NextResponse.json({ ok: true, requests: created });
  } catch (e) {
    log.error("sign.create_requests_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not send for signature" }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const docType = url.searchParams.get("doc_type");
  const docId = url.searchParams.get("doc_id");
  if (!isSignDocType(docType) || !isUuid(docId)) {
    return NextResponse.json({ ok: false, error: "doc_type and doc_id are required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .select(LIST_COLUMNS)
      .eq("doc_type", docType)
      .eq("doc_id", docId)
      .order("signer_index", { ascending: true });
    if (error) {
      if (signatureTableMissing(error)) return NextResponse.json({ ok: true, requests: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, requests: data ?? [] });
  } catch (e) {
    log.error("sign.list_requests_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not load signing status" }, { status: 500 });
  }
}

function documentLabel(docType: string, summary: string): string {
  const base =
    docType === "fact_find"
      ? "Borrower Fact Find"
      : docType === "needs_analysis"
        ? "Needs Analysis"
        : "Credit Authorisation";
  return summary ? `${base} (${summary})` : base;
}
