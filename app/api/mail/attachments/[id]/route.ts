/**
 * DELETE /api/mail/attachments/{id}
 *   Remove an attachment row + the underlying Storage object.
 *
 * Ownership: walked via the email_kind → email_id pointer. For drafts we
 * look up email_drafts.owner_user_email; for outbound/inbound we look up
 * email_log.owner_user_email. 404 on mismatch regardless of existence.
 *
 * GET /api/mail/attachments/{id}
 *   Returns a short-lived signed download URL plus metadata.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

const BUCKET = "mail-attachments";
const SIGNED_DOWNLOAD_TTL = 60 * 15; // 15 minutes — generous for "click and download"

type AttachmentRow = {
  id: string;
  email_id: string;
  email_kind: "inbound" | "outbound" | "draft";
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
};

async function loadOwnedAttachment(
  id: string,
  owner: string,
): Promise<
  | { ok: true; row: AttachmentRow }
  | { ok: false; status: number; error: string }
> {
  const { data: row, error } = await supabase
    .from("email_attachments")
    .select("id,email_id,email_kind,filename,mime_type,size_bytes,storage_path")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!row) return { ok: false, status: 404, error: "Attachment not found" };

  // Resolve owner via the parent table the attachment points at.
  if (row.email_kind === "draft") {
    const { data: d } = await supabase
      .from("email_drafts")
      .select("owner_user_email")
      .eq("id", row.email_id)
      .maybeSingle();
    if (!d || d.owner_user_email !== owner) {
      return { ok: false, status: 404, error: "Attachment not found" };
    }
  } else {
    const { data: e } = await supabase
      .from("email_log")
      .select("owner_user_email")
      .eq("id", row.email_id)
      .maybeSingle();
    if (!e || e.owner_user_email !== owner) {
      return { ok: false, status: 404, error: "Attachment not found" };
    }
  }
  return { ok: true, row: row as AttachmentRow };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const lookup = await loadOwnedAttachment(id, owner);
  if (!lookup.ok) return NextResponse.json({ ok: false, error: lookup.error }, { status: lookup.status });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(lookup.row.storage_path, SIGNED_DOWNLOAD_TTL, {
      download: lookup.row.filename,
    });
  if (error || !data?.signedUrl) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Sign failed" }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    url: data.signedUrl,
    filename: lookup.row.filename,
    size_bytes: lookup.row.size_bytes,
    mime_type: lookup.row.mime_type,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const lookup = await loadOwnedAttachment(id, owner);
  if (!lookup.ok) return NextResponse.json({ ok: false, error: lookup.error }, { status: lookup.status });

  // Remove the storage object first; if it succeeds the DB row goes. If
  // the storage delete fails we still attempt the DB delete because the
  // row is the source of truth for the UI — an orphaned object is
  // recoverable via a periodic sweep, an orphaned row is not.
  await supabase.storage.from(BUCKET).remove([lookup.row.storage_path]).catch(() => {});

  const { error: delErr } = await supabase
    .from("email_attachments")
    .delete()
    .eq("id", id);
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
