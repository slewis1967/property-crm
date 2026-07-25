/**
 * Uploading one of YLA's required documents into a document_request — shared by
 * the CLIENT's portal (token-scoped) and the ADVISOR's opportunity page
 * (auth-scoped).
 *
 * Both paths write the same rows the Drive export and verification gate read,
 * so they must agree on filename, slot supersession and status exactly. They
 * used to exist only in the portal route; a client who emails or posts their
 * documents in — which plenty do — had no way in at all. Extracted here rather
 * than copied so the two can never drift apart.
 *
 * Bytes never pass through the server: the caller PUTs straight to storage with
 * the signed URL this returns, then calls confirm. That is a hard constraint —
 * Netlify's function body limit already made server-side multipart unusable.
 */
import { supabase } from "./supabase";
import { DOC_BY_KEY, ylaFilename, surnameOf, maxSlotFor, YLA_MAX_BYTES } from "./yla-documents";

export const CLIENT_DOCUMENTS_BUCKET = "client-documents";

/** The request being uploaded into — resolved by the caller, however it authed. */
export type UploadTargetRequest = {
  id: string;
  applicant_name: string;
  client_ref: string | null;
};

export type PrepareInput = {
  doc_key: unknown;
  slot: unknown;
  size: unknown;
  mime_type?: unknown;
  original_name?: unknown;
};

export type PrepareResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      token: string;
      path: string;
      bucket: string;
      document_id: string;
      filename: string;
    };

/**
 * Validate the request, mint a signed upload URL, supersede whatever was in the
 * slot, and pre-insert the row so the UI can show the file immediately.
 *
 * `uploadedBy` records who put it there — null for the client's own portal
 * upload, the advisor's identity when they do it on the client's behalf. That
 * distinction matters later: a document the client never touched is one nobody
 * has confirmed is theirs.
 */
export async function prepareClientDocumentUpload(
  request: UploadTargetRequest,
  body: PrepareInput,
  uploadedBy?: string | null,
): Promise<PrepareResult> {
  const spec = DOC_BY_KEY[String(body.doc_key)];
  if (!spec) return { ok: false, status: 400, error: "Unknown document type" };

  // The ceiling, not the required count: ATO statements allow extras because
  // myGov issues one per employer, so a two-job year genuinely has two.
  const slotNum = Number(body.slot);
  if (!Number.isInteger(slotNum) || slotNum < 1 || slotNum > maxSlotFor(spec.key)) {
    return { ok: false, status: 400, error: "Invalid document slot" };
  }

  const size = body.size;
  if (typeof size !== "number" || size <= 0) {
    return { ok: false, status: 400, error: "size must be > 0" };
  }
  if (size > YLA_MAX_BYTES) {
    return {
      ok: false,
      status: 400,
      error:
        "That file is still over 1MB after compression. Please upload a clearer, smaller original — a PDF downloaded from the source rather than a photo works best.",
    };
  }

  const filename = ylaFilename(spec.key, slotNum, surnameOf(request.applicant_name), request.client_ref);
  const path = `portal/${request.id}/${Date.now()}-${filename.replace(/[^\w.\- ]+/g, "_")}`;

  const { data, error } = await supabase.storage.from(CLIENT_DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, status: 500, error: "Could not start the upload. Please try again." };
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
      mime_type: typeof body.mime_type === "string" ? body.mime_type : "application/pdf",
      size_bytes: size,
      status: "uploaded",
      // Advisor-supplied documents are audibly different from client-supplied
      // ones. Recorded in check_notes because it needs no migration and shows
      // up everywhere the notes already render.
      check_notes: uploadedBy ? `Uploaded on the client's behalf by ${uploadedBy}` : null,
    })
    .select("id")
    .single();

  if (insErr || !row) {
    return { ok: false, status: 500, error: "Could not record the upload." };
  }

  return {
    ok: true,
    token: data.token,
    path: data.path,
    bucket: CLIENT_DOCUMENTS_BUCKET,
    document_id: String(row.id),
    filename,
  };
}

/**
 * Promote or roll back a pre-inserted row once the direct-to-storage PUT
 * resolves. A failed PUT must not leave a row that looks like a delivered
 * document — the completeness count is the thing the whole flow is trusted for.
 *
 * Scoped to the request so no caller can touch another applicant's row.
 */
export async function confirmClientDocumentUpload(args: {
  requestId: string;
  documentId: unknown;
  succeeded: boolean;
  /** Preserved on success so "uploaded on behalf of" survives the promotion. */
  keepNote?: string | null;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const { documentId } = args;
  if (!documentId || typeof documentId !== "string") {
    return { ok: false, status: 400, error: "document_id required" };
  }

  const { error } = await supabase
    .from("client_documents")
    .update(
      args.succeeded
        ? { status: "accepted", check_notes: args.keepNote ?? null }
        : { status: "replaced", check_notes: "Upload did not complete" },
    )
    .eq("id", documentId)
    .eq("request_id", args.requestId);

  if (error) return { ok: false, status: 500, error: "Could not confirm the upload." };
  return { ok: true, status: 200 };
}
