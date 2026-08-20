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
import { isSignDocType } from "../../../utils/signatures";
import { loadDoc } from "../../../utils/sign-doc-render";
import {
  createSignatureRequests,
  MAX_SIGNERS,
} from "../../../utils/signature-requests-create";
import {
  SIGNATURE_REQUESTS_TABLE,
  signatureTableMissing,
  isValidEmail,
  isUuid,
  LIST_COLUMNS,
} from "../../../utils/signature-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const result = await createSignatureRequests({
      docType,
      docId,
      docLabel,
      signers,
      origin: publicOrigin(req),
      message: typeof body.message === "string" ? body.message : "",
      expiresInDays: typeof body.expiresInDays === "number" ? body.expiresInDays : undefined,
      createdBy: auth,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, requests: result.requests });
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
        : docType === "eoi"
          ? "Expression of Interest"
          : "Credit Authorisation";
  return summary ? `${base} (${summary})` : base;
}
