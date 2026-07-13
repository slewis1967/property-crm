/**
 * PUBLIC signed-copy download — TOKEN-AUTHENTICATED, NO requireAuth.
 *
 * GET /api/sign/[token]/signed
 *   Streams the stored SIGNED PDF for this token's request, so a signer can
 *   download their own signed copy from the confirmation screen. Only works once
 *   the request is 'signed' and a PDF was stored. Token-scoped to one document;
 *   generic 404 otherwise (no info leak).
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { log } from "../../../../../utils/logger";
import { findRequestByToken } from "../../../../../utils/signature-requests-db";
import { rateKeyFromToken, clientIp } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "signed-documents";

function notAvailable(): NextResponse {
  return NextResponse.json({ ok: false, error: "Not available" }, { status: 404 });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 15, keyFn: () => rateKeyFromToken(req, token) });
  if (limited) return limited;

  try {
    const found = await findRequestByToken(token);
    if (!found.ok) return notAvailable();
    const row = found.row;
    if (row.status !== "signed" || !row.signed_pdf_path) return notAvailable();

    const { data, error } = await supabase.storage.from(BUCKET).download(row.signed_pdf_path);
    if (error || !data) return notAvailable();
    const bytes = new Uint8Array(await data.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="signed-${row.doc_type}.pdf"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("sign.signed_download_failed", { message: e instanceof Error ? e.message : String(e), ip: clientIp(req) });
    return notAvailable();
  }
}
