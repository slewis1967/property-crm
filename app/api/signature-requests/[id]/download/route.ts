/**
 * GET /api/signature-requests/[id]/download — AUTHED advisor download of a signer's
 * stored signed PDF (behind Cloudflare Access). Streams the PDF from the private
 * `signed-documents` bucket. 404 when the request isn't signed / has no PDF.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log } from "../../../../../utils/logger";
import {
  SIGNATURE_REQUESTS_TABLE,
  signatureTableMissing,
} from "../../../../../utils/signature-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "signed-documents";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const { data: row, error } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .select("doc_type,status,signed_pdf_path")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (signatureTableMissing(error)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      throw error;
    }
    const r = row as { doc_type: string; status: string; signed_pdf_path: string | null } | null;
    if (!r || r.status !== "signed" || !r.signed_pdf_path) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const { data, error: dlErr } = await supabase.storage.from(BUCKET).download(r.signed_pdf_path);
    if (dlErr || !data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const bytes = new Uint8Array(await data.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="signed-${r.doc_type}.pdf"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    log.error("sign.advisor_download_failed", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "Download failed" }, { status: 500 });
  }
}
