/**
 * POST /api/portal/<token>/upload-url
 *   Body: { doc_key, applicant_index?, slot, size, mime_type }
 *
 * PUBLIC. Mints a signed Supabase Storage upload URL and pre-inserts the
 * client_documents row. The browser then PUTs the bytes straight to storage —
 * they never traverse the Netlify function (its body-size limit returns 500s on
 * multipart), same approach as /api/mail/attachments/upload-url.
 *
 * The bytes arriving here have ALREADY been normalised to a compliant PDF on
 * the client's device (see app/portal/[token]/normalise.ts). We still enforce
 * the ceiling server-side — a public endpoint cannot trust its caller.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { DOC_BY_KEY, ylaFilename, surnameOf, YLA_MAX_BYTES } from "../../../../../utils/yla-documents";
import { resolveToken, clientIp } from "../../_shared";
import { enforceRateLimit } from "../../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

const BUCKET = "client-documents";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const request = resolved.request;

  // PUBLIC endpoint: a valid-token holder could otherwise loop this to mint
  // unbounded signed upload URLs + client_documents rows (per-file size is
  // capped, count wasn't). Throttle per token+IP.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 30,
    keyFn: () => `portal-upload:${token}:${clientIp(req)}`,
  });
  if (limited) return limited;

  if (request.status === "submitted") {
    return NextResponse.json(
      { ok: false, error: "This application has already been submitted. Contact your consultant to add anything further." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { doc_key, slot, size, mime_type } = body ?? {};

  const spec = DOC_BY_KEY[doc_key];
  if (!spec) {
    return NextResponse.json({ ok: false, error: "Unknown document type" }, { status: 400 });
  }

  const slotNum = Number(slot);
  if (!Number.isInteger(slotNum) || slotNum < 1 || slotNum > spec.count) {
    return NextResponse.json({ ok: false, error: "Invalid document slot" }, { status: 400 });
  }

  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
  }
  if (size > YLA_MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "That file is still over 1MB after compression. Please upload a clearer, smaller original — a PDF downloaded from the source rather than a photo works best.",
      },
      { status: 400 },
    );
  }

  const surname = surnameOf(request.applicant_name);
  const filename = ylaFilename(spec.key, slotNum, surname, request.client_ref);
  const path = `portal/${request.id}/${Date.now()}-${filename.replace(/[^\w.\- ]+/g, "_")}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "Could not start the upload. Please try again." },
      { status: 500 },
    );
  }

  // Supersede any previous file in this slot so re-uploading replaces rather
  // than duplicates. 'replaced' rows are retained for audit, and filtered out
  // of the portal view and the Drive export.
  await supabase
    .from("client_documents")
    .update({ status: "replaced" })
    .eq("request_id", request.id)
    .eq("doc_type", spec.key)
    .eq("filename", filename)
    .neq("status", "replaced");

  const { data: row, error: insErr } = await supabase
    .from("client_documents")
    .insert({
      request_id: request.id,
      doc_type: spec.key,
      filename,
      original_name: typeof body.original_name === "string" ? body.original_name.slice(0, 200) : null,
      storage_path: path,
      mime_type: typeof mime_type === "string" ? mime_type : "application/pdf",
      size_bytes: size,
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insErr || !row) {
    return NextResponse.json({ ok: false, error: "Could not record the upload." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    token: data.token,
    path: data.path,
    bucket: BUCKET,
    document_id: row.id,
    filename,
  });
}
