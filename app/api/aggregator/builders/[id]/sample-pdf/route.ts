/**
 * POST /api/aggregator/builders/{id}/sample-pdf
 *   Body: { mime: string, size: number }
 *
 * Signs an upload URL on Supabase Storage's `ingestion` bucket so the
 * browser can PUT the PDF directly (Netlify body-size limit safety).
 * The actual file → builder linkage is saved by the client calling
 * PATCH /api/aggregator/builders/{id} with the resulting publicUrl
 * after the upload succeeds.
 *
 * Path layout: ingestion/builder-samples/{builder_id}/{timestamp}.pdf
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB — stocklists can be hefty
const ALLOWED_MIME = new Set([
  "application/pdf",
  // Allow Excel too — some builders ship XLSX stocklists. The
  // aggregator's _artifact_preview handles both.
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mime: string = typeof body.mime === "string" ? body.mime : "";
    const size: number = typeof body.size === "number" ? body.size : 0;

    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported MIME type: ${mime || "(missing)"} — PDF or Excel only` },
        { status: 400 },
      );
    }
    if (size <= 0) {
      return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    const ext = mime === "application/pdf" ? "pdf" : "xlsx";
    const path = `builder-samples/${id}/${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("ingestion")
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: `Storage signing failed: ${error?.message || "unknown"}` },
        { status: 500 },
      );
    }

    const { data: pub } = supabase.storage.from("ingestion").getPublicUrl(path);
    if (!pub?.publicUrl) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve public URL — bucket may not be public" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      token: data.token,
      path: data.path,
      publicUrl: pub.publicUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Unhandled: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
