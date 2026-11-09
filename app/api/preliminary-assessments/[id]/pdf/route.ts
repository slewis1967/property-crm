/**
 * GET /api/preliminary-assessments/<id>/pdf   (AUTHED — CF Access)
 *
 * Streams the PA exactly as YLA sent it, inline so it opens in a browser tab.
 * The bucket is private and there is no signed URL: a credit proposal should not
 * exist as a link that works for whoever it is forwarded to.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log } from "../../../../../utils/logger";
import { errMessage } from "../../../../../utils/errors";
import { PA_BUCKET, PRELIMINARY_ASSESSMENTS_TABLE } from "../../../../../utils/preliminary-assessments";
import { isUuid, paTableMissing } from "../../../../../utils/pa-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The filename is YLA's, taken from an email header — keep it out of the
 * response header unless it is plain ASCII with nothing that can end the quote. */
function safeFilename(name: string | null, ref: string): string {
  const cleaned = (name ?? "").replace(/[^A-Za-z0-9 ._()$-]/g, "").trim();
  return /\.pdf$/i.test(cleaned) ? cleaned : `preliminary-assessment-${ref.replace(/[^0-9A-Za-z]/g, "")}.pdf`;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  try {
    const { data: row, error } = await supabase
      .from(PRELIMINARY_ASSESSMENTS_TABLE)
      .select("yla_ref,pdf_path,pdf_filename")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (paTableMissing(error)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      throw error;
    }
    const r = row as { yla_ref: string; pdf_path: string | null; pdf_filename: string | null } | null;
    if (!r?.pdf_path) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const { data, error: dlErr } = await supabase.storage.from(PA_BUCKET).download(r.pdf_path);
    if (dlErr || !data) {
      // The row exists but its file does not: a feeder or bucket fault, worth a log line.
      log.error("pa.pdf_missing_in_bucket", { pa: id, message: errMessage(dlErr, "no data") });
      return NextResponse.json({ ok: false, error: "The PDF for this assessment could not be read" }, { status: 404 });
    }

    const bytes = new Uint8Array(await data.arrayBuffer());
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${safeFilename(r.pdf_filename, r.yla_ref)}"`,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    log.error("pa.pdf_failed", { pa: id, message: errMessage(e) });
    return NextResponse.json({ ok: false, error: "Could not open the PDF" }, { status: 500 });
  }
}
