/**
 * PUBLIC driver's-licence upload — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * POST /api/sign/[token]/licence
 *   Body: { file_data_url }  — a base64 data URI (image or PDF).
 *
 *   Requested only on the EOI signing page (doc_type = 'eoi'). Stores the licence
 *   privately in the `signing-uploads` bucket and records its path on this
 *   signer's signature_requests row AND (as the most-recent) on the EOI, where it
 *   becomes the identity document for the AML "Start CDD from EOI" tie-in.
 *
 * INTERNET-FACING — treat every input as hostile. Rate-limited; generic errors.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { log } from "../../../../../utils/logger";
import { isExpired, isTerminalStatus } from "../../../../../utils/signatures";
import { SIGNATURE_REQUESTS_TABLE, findRequestByToken } from "../../../../../utils/signature-requests-db";
import { clientIp, rateKeyFromToken } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "signing-uploads";
const MAX_DATA_URL_BYTES = 8 * 1024 * 1024; // ~6MB file — the client downscales images before upload
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

/** Parse a `data:<mime>;base64,<data>` URI into a validated {mime, bytes}. */
function parseDataUrl(v: unknown): { mime: string; bytes: Buffer } | null {
  if (typeof v !== "string" || v.length > MAX_DATA_URL_BYTES) return null;
  const m = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/.exec(v);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!EXT_BY_MIME[mime]) return null;
  try {
    return { mime, bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 10, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const body = (await req.json().catch(() => ({}))) as { file_data_url?: unknown };
    const parsed = parseDataUrl(body.file_data_url);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, error: "Please attach a clear photo or PDF of your driver's licence (max ~6MB)." },
        { status: 400 },
      );
    }

    const found = await findRequestByToken(token);
    if (!found.ok) {
      return NextResponse.json({ ok: false, error: "This link is no longer valid." }, { status: 400 });
    }
    const row = found.row;
    if (row.doc_type !== "eoi") {
      return NextResponse.json({ ok: false, error: "A licence isn't required for this document." }, { status: 400 });
    }
    if (
      row.status === "signed" ||
      row.status === "declined" ||
      row.status === "expired" ||
      isExpired(row.expires_at, Date.now()) ||
      isTerminalStatus(row.status)
    ) {
      return NextResponse.json({ ok: false, error: "This link is no longer valid." }, { status: 400 });
    }

    const ext = EXT_BY_MIME[parsed.mime];
    const path = `licences/${row.doc_id}/${row.id}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, parsed.bytes, { contentType: parsed.mime, upsert: true });
    if (upErr) {
      log.error("sign.licence_upload_failed", { message: upErr.message, path });
      return NextResponse.json({ ok: false, error: "Could not upload your licence. Please try again." }, { status: 500 });
    }

    const now = new Date().toISOString();
    // Record on this signer's request, and mirror the latest onto the EOI (the
    // identity document for the AML "Start CDD from EOI" tie-in). Both best-effort
    // beyond the upload itself.
    await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .update({ licence_file_path: path, licence_uploaded_at: now })
      .eq("id", row.id);
    await supabase
      .from("eois")
      .update({ licence_file_path: path, licence_uploaded_at: now })
      .eq("id", row.doc_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("sign.licence_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return NextResponse.json({ ok: false, error: "Could not upload your licence. Please try again." }, { status: 500 });
  }
}
