/**
 * Applying the redactor to documents we are already holding.
 *
 * Two entry points, deliberately:
 *   - on the way IN, every upload is cleaned before anyone looks at it, so a
 *     TFN never settles in the bucket in the first place;
 *   - on the way OUT, an application the gate has already flagged is cleaned so
 *     it can clear the gate by itself.
 *
 * The cleaned bytes REPLACE the stored object rather than creating a new
 * document row. It is the same document — the same slot, the same upload, the
 * same rep dismissal if one was made — with something removed that should never
 * have reached us. A new row would reopen the slot, reorder the set and drop any
 * dismissal on the floor, all to record a change the client did not make.
 */
import { supabase } from "./supabase";
import { redactTfns } from "./tfn-redact";

// Named here rather than imported from client-document-upload: that module
// imports THIS one to clean each upload as it lands, and a cycle between them
// would leave the constant undefined at module init depending on which side got
// loaded first. yla-export.ts and the opportunity document routes spell it out
// the same way.
const CLIENT_DOCUMENTS_BUCKET = "client-documents";

/** Never let redaction take the whole serverless window. */
const REDACT_CONCURRENCY = 4;

export type StoredRedaction = { filename: string; removed: number };

/**
 * Clean ONE stored document in place. Returns how many numbers were removed —
 * 0 means either "nothing there" or "nothing findable" (a photographed page has
 * no text layer), and the caller must never read 0 as proof the file is clean.
 */
export async function redactStoredDocument(documentId: string): Promise<StoredRedaction | null> {
  const { data: doc } = await supabase
    .from("client_documents")
    .select("id,filename,storage_path,mime_type,check_notes")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.storage_path) return null;

  const { data: file, error: dlErr } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .download(doc.storage_path as string);
  if (dlErr || !file) return null;

  const original = new Uint8Array(await file.arrayBuffer());
  const result = await redactTfns(original);
  if (result.removed === 0) return { filename: doc.filename as string, removed: 0 };

  const { error: upErr } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(doc.storage_path as string, result.bytes, {
      upsert: true,
      contentType: (doc.mime_type as string) || "application/pdf",
    });
  // A failed write must not be recorded as a redaction: the document would read
  // as cleaned while the bucket still holds the original.
  if (upErr) return { filename: doc.filename as string, removed: 0 };

  const note = `Tax File Number removed automatically ${new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}`;
  const existing = (doc.check_notes as string | null) || "";
  await supabase
    .from("client_documents")
    .update({
      size_bytes: result.bytes.byteLength,
      check_notes: existing && !existing.includes("Tax File Number removed") ? `${existing}; ${note}` : note,
    })
    .eq("id", documentId);

  return { filename: doc.filename as string, removed: result.removed };
}

/**
 * Clean every live document across an application. Used when the gate has
 * already flagged one: the sweep runs this, and only re-verifies if something
 * actually came out — otherwise a document whose number is in pixels would be
 * re-checked, and re-paid for, on every sweep forever.
 */
export async function redactApplicationTfns(requestIds: string[]): Promise<StoredRedaction[]> {
  const { data: docs } = await supabase
    .from("client_documents")
    .select("id")
    .in("request_id", requestIds)
    .neq("status", "replaced");
  const ids = (docs ?? []).map((d) => d.id as string);

  const out: StoredRedaction[] = [];
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const id = ids[next++]!;
      const r = await redactStoredDocument(id);
      if (r && r.removed > 0) out.push(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(REDACT_CONCURRENCY, ids.length) }, () => worker()));
  return out;
}
