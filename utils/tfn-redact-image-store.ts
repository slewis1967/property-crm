/**
 * Applying the IMAGE redactor (utils/tfn-redact-image.ts) to stored client
 * documents, and telling the rest of the pipeline about it.
 *
 * Kept apart from tfn-redact-store.ts so tesseract never lands in the upload
 * route's bundle: this runs only in the background function
 * (netlify/functions/tfn-image-redact-background.mts), triggered by
 * `requestImageRedaction()` from the upload confirm and the sweep.
 *
 * Same storage contract as the text redactor: the cleaned bytes REPLACE the
 * stored object in place, and the document row gets a note.
 */
import { supabase } from "./supabase";
import { redactTfnsInImages, type OcrFn } from "./tfn-redact-image";
import { hasTfnBlocker } from "./yla-verification";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";

const CLIENT_DOCUMENTS_BUCKET = "client-documents";

/** Only these carry a TFN. A licence or a payslip is never OCR'd for one. */
export const TFN_DOC_TYPES = ["ato_income", "super_statement"];

/** Left on a document the redactor could not clean, so the sweep does not
 *  re-run OCR on the same file every two hours. A new upload is a new row. */
export const IMAGE_REDACT_GAVE_UP = "Automatic TFN removal could not clean this image";

const today = () => new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" });

export type ImageRedactOutcome = { id: string; filename: string; removed: number; result: "cleaned" | "clean" | "gave_up" | "skipped" };

export async function redactStoredDocumentImages(documentId: string, ocr: OcrFn): Promise<ImageRedactOutcome | null> {
  const { data: doc } = await supabase
    .from("client_documents")
    .select("id,request_id,doc_type,filename,storage_path,mime_type,check_notes,status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.storage_path) return null;
  const base = { id: doc.id as string, filename: doc.filename as string };
  const notes = (doc.check_notes as string | null) || "";
  if (!TFN_DOC_TYPES.includes(doc.doc_type as string) || doc.status === "uploaded" || notes.includes(IMAGE_REDACT_GAVE_UP)) {
    return { ...base, removed: 0, result: "skipped" };
  }

  const { data: file, error: dlErr } = await supabase.storage.from(CLIENT_DOCUMENTS_BUCKET).download(doc.storage_path as string);
  if (dlErr || !file) return null;

  const r = await redactTfnsInImages(new Uint8Array(await file.arrayBuffer()), ocr);

  const note = (text: string) => (notes ? `${notes}; ${text}` : text);

  if (r.removed === 0 || r.verifyFailed) {
    // Nothing found in an image-only file is the normal case (most statements
    // have no TFN at all) — only record giving up when a number was seen and
    // could not be removed, or the file could not be read.
    if (r.verifyFailed || r.unsupported > 0 || r.unreadable) {
      if (r.removed > 0) {
        // Some images cleaned, one did not: keep the improvement, stay held.
        await supabase.storage.from(CLIENT_DOCUMENTS_BUCKET).upload(doc.storage_path as string, r.bytes, {
          upsert: true,
          contentType: (doc.mime_type as string) || "application/pdf",
        });
      }
      await supabase
        .from("client_documents")
        .update({ check_notes: note(`${IMAGE_REDACT_GAVE_UP} (${today()}) — redact by hand`) })
        .eq("id", documentId);
      return { ...base, removed: 0, result: "gave_up" };
    }
    return { ...base, removed: 0, result: "clean" };
  }

  const { error: upErr } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(doc.storage_path as string, r.bytes, { upsert: true, contentType: (doc.mime_type as string) || "application/pdf" });
  if (upErr) return null; // never record a redaction the bucket does not hold

  await supabase
    .from("client_documents")
    .update({
      size_bytes: r.bytes.byteLength,
      check_notes: notes.includes("Tax File Number removed")
        ? notes
        : note(`Tax File Number removed automatically from the image ${today()}`),
    })
    .eq("id", documentId);

  // If the gate is holding this application for a TFN, its verdict is about a
  // file that no longer exists. Clear it so the next sweep re-checks the set
  // instead of skipping it as "nothing new uploaded".
  await releaseTfnHold(doc.request_id as string);

  return { ...base, removed: r.removed, result: "cleaned" };
}

async function releaseTfnHold(requestId: string): Promise<void> {
  const { data: req } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,application_id,verification_status,verification_issues")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return;
  let ids = [req.id as string];
  let held = req.verification_status === "failed" && hasTfnBlocker(req.verification_issues as never);
  if (req.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,verification_status,verification_issues")
      .eq("application_id", req.application_id);
    if (sibs?.length) {
      ids = sibs.map((s) => s.id as string);
      held = sibs.some((s) => s.verification_status === "failed" && hasTfnBlocker(s.verification_issues as never));
    }
  }
  if (!held) return;
  await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({ verification_status: null, verification_issues: null, verified_at: null, updated_at: new Date().toISOString() })
    .in("id", ids);
}
