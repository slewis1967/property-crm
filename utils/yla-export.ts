/**
 * Packages an APPLICATION's collected documents into ONE Google Drive folder
 * (every applicant's files together, so YLA get a single link). Shared by the
 * manual /export route and the auto-submit sweep.
 *
 * Downloads are parallel (a joint application is ~14 files; one-by-one blows the
 * serverless time limit). Idempotent-ish: if already exported, returns the
 * existing folder rather than duplicating it.
 */
import { supabase } from "./supabase";
import { requiredSlots, surnameOf } from "./yla-documents";
import { exportToDrive } from "./google-drive";
import { DOCUMENT_REQUESTS_TABLE, docTableMissing } from "./document-requests-db";

const BUCKET = "client-documents";
const SELECT = "id,client_ref,application_id,applicant_name,status,drive_folder_url,created_at";
const DL_CONCURRENCY = 6;

export type ExportRunResult =
  | { ok: false; status: number; error: string; folderUrl?: string; missing?: number }
  | { ok: true; alreadyExported: boolean; folderUrl: string; folderId: string | null; uploaded: number; applicants: number; warning?: string };

export async function exportApplicationToDrive(id: string, opts?: { force?: boolean }): Promise<ExportRunResult> {
  const force = opts?.force === true;

  const { data: request, error: reqErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (reqErr) {
    if (docTableMissing(reqErr)) return { ok: false, status: 503, error: "Document storage isn't set up yet." };
    return { ok: false, status: 500, error: reqErr.message };
  }
  if (!request) return { ok: false, status: 404, error: "Not found" };

  let siblings = [request];
  if (request.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select(SELECT)
      .eq("application_id", request.application_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (sibs && sibs.length) siblings = sibs;
  }

  const already = siblings.find((s) => s.status === "submitted" && s.drive_folder_url);
  if (already) {
    return { ok: true, alreadyExported: true, folderUrl: already.drive_folder_url, folderId: null, uploaded: 0, applicants: siblings.length };
  }

  const slots = requiredSlots();
  const matches: { filename: string; storage_path: string; mime: string }[] = [];
  let missing = 0;
  for (const sib of siblings) {
    const { data: docs, error: docErr } = await supabase
      .from("client_documents")
      .select("id,doc_type,filename,storage_path,mime_type,status,uploaded_at")
      .eq("request_id", sib.id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });
    if (docErr) return { ok: false, status: 500, error: docErr.message };
    const used = new Set<string>();
    for (const slot of slots) {
      const match = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
      if (!match) {
        missing++;
        continue;
      }
      used.add(match.id);
      matches.push({ filename: match.filename, storage_path: match.storage_path, mime: match.mime_type || "application/pdf" });
    }
  }

  const files: { name: string; bytes: ArrayBuffer; mime: string }[] = [];
  let downloadError: string | null = null;
  let nextIdx = 0;
  async function downloadWorker() {
    while (nextIdx < matches.length && !downloadError) {
      const m = matches[nextIdx++]!;
      const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
      if (signErr || !signed?.signedUrl) {
        downloadError = `Could not read ${m.filename} from storage.`;
        return;
      }
      const res = await fetch(signed.signedUrl);
      if (!res.ok) {
        downloadError = `Could not download ${m.filename}.`;
        return;
      }
      files.push({ name: m.filename, bytes: await res.arrayBuffer(), mime: m.mime });
    }
  }
  await Promise.all(Array.from({ length: Math.min(DL_CONCURRENCY, matches.length) }, () => downloadWorker()));
  if (downloadError) return { ok: false, status: 500, error: downloadError };

  if (missing > 0 && !force) {
    return { ok: false, status: 409, error: `${missing} document(s) still outstanding across the application.`, missing };
  }
  if (files.length === 0) return { ok: false, status: 409, error: "No documents to export yet." };

  const primary = siblings[0]!;
  const surname = surnameOf(primary.applicant_name) || primary.applicant_name;
  const today = new Date().toISOString().slice(0, 10);
  const ref = primary.client_ref ? ` (${primary.client_ref})` : "";
  const folderName = `${surname} - ${primary.applicant_name}${ref} - ${today}`;

  const result = await exportToDrive({ folderName, files });
  if (!result.ok) return { ok: false, status: 502, error: result.error };

  const ids = siblings.map((s) => s.id);
  const { error: updErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({
      status: "submitted",
      drive_folder_id: result.folderId,
      drive_folder_url: result.folderUrl,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  return {
    ok: true,
    alreadyExported: false,
    folderUrl: result.folderUrl,
    folderId: result.folderId,
    uploaded: result.uploaded,
    applicants: siblings.length,
    warning: updErr ? "Exported, but could not update the request status: " + updErr.message : undefined,
  };
}
