/**
 * POST /api/mail/attachments/upload-url
 *   Body: { draft_id: string, filename: string, size: number, mime_type?: string }
 *
 * Creates a signed upload URL on the `mail-attachments` Storage bucket and
 * pre-inserts an `email_attachments` row tied to the draft. The browser then
 * PUTs the file directly to the signed URL — Netlify's serverless body-size
 * limit never sees the bytes (see reference_supabase_direct_upload).
 *
 * Response shape mirrors /api/settings/signature/logo so existing client
 * code can be lifted with minor changes:
 *   { ok, token, path, attachment_id }
 *
 * On the client:
 *   await supabaseBrowser.storage
 *     .from("mail-attachments")
 *     .uploadToSignedUrl(path, token, file);
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024;  // matches the bucket's file_size_limit
const BUCKET = "mail-attachments";

export async function POST(req: Request) {
  const owner = await userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { draft_id, filename, size, mime_type } = body ?? {};

  if (!draft_id || typeof draft_id !== "string") {
    return NextResponse.json({ ok: false, error: "draft_id required" }, { status: 400 });
  }
  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0) {
    return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
  }
  if (size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
      { status: 400 },
    );
  }

  // Confirm the draft exists and belongs to the caller before allocating
  // a storage slot — prevents a malicious draft_id from writing into someone
  // else's email folder.
  const { data: draft, error: draftErr } = await supabase
    .from("email_drafts")
    .select("id")
    .eq("id", draft_id)
    .eq("owner_user_email", owner)
    .maybeSingle();
  if (draftErr) return NextResponse.json({ ok: false, error: draftErr.message }, { status: 500 });
  if (!draft) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });

  // Path: mail/{owner}/draft/{draft_id}/{epoch}-{safe-name}
  // Epoch prefix prevents same-name collisions when re-uploading; we keep the
  // original filename in the DB row for display.
  const safe = filename.replace(/[^\w.\-]+/g, "_").slice(0, 80);
  const path = `mail/${owner}/draft/${draft_id}/${Date.now()}-${safe}`;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: `Storage signing failed: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // Pre-create the email_attachments row so the UI can show a chip
  // immediately. Once the PUT completes the row is "valid"; if the PUT fails
  // the row is orphaned but harmless — a small daily cron could clean stale
  // unsent attachments (Phase 2 scope).
  const { data: attachmentRow, error: insErr } = await supabase
    .from("email_attachments")
    .insert({
      email_id: draft_id,
      email_kind: "draft",
      filename,
      mime_type: typeof mime_type === "string" ? mime_type : null,
      size_bytes: size,
      storage_path: path,
    })
    .select("id")
    .single();
  if (insErr || !attachmentRow) {
    return NextResponse.json(
      { ok: false, error: `Attachment row insert failed: ${insErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    token: data.token,
    path: data.path,
    attachment_id: attachmentRow.id,
  });
}
