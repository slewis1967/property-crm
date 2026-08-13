/**
 * POST /api/shared-folder/upload-url
 *   Body: { parent_id?: string|null, filename: string, size: number, mime_type?: string }
 *
 * Reserves a row and mints a signed upload URL on the `shared-folder` bucket.
 * The browser then PUTs the bytes straight to Supabase — the same trick used
 * by /api/mail/attachments/upload-url, because Netlify's serverless body-size
 * limit 500s on multipart uploads long before a 100MB file gets through.
 *
 * The row is created as status='pending' and only becomes visible in the
 * listing once the client PATCHes { confirm: true }. An abandoned upload
 * therefore leaves an invisible row rather than a listing entry that fails to
 * download.
 *
 * On the client:
 *   await supabaseBrowser.storage
 *     .from("shared-folder")
 *     .uploadToSignedUrl(path, token, file);
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  SHARED_FOLDER_TABLE,
  SHARED_FOLDER_BUCKET,
  MAX_FILE_BYTES,
  MIGRATION_HINT,
  sharedFolderTableMissing,
  sanitiseName,
  safeStorageName,
  uniqueName,
  fmtBytes,
} from "../../../../utils/shared-folder";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as {
    parent_id?: unknown;
    filename?: unknown;
    size?: unknown;
    mime_type?: unknown;
  };

  const name = sanitiseName(body.filename);
  if (!name) {
    return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });
  }
  if (typeof body.size !== "number" || !Number.isFinite(body.size) || body.size <= 0) {
    return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
  }
  if (body.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { ok: false, error: `"${name}" is too large (max ${fmtBytes(MAX_FILE_BYTES)} per file).` },
      { status: 400 },
    );
  }
  const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null;

  try {
    // Confirm the destination folder is real and live before allocating a
    // storage slot — otherwise a stale tab uploads into a folder someone
    // deleted five minutes ago and the file is unreachable from the tree.
    if (parentId) {
      const { data: parent, error: pErr } = await supabase
        .from(SHARED_FOLDER_TABLE)
        .select("id,kind,deleted_at")
        .eq("id", parentId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parent || parent.kind !== "folder" || parent.deleted_at) {
        return NextResponse.json(
          { ok: false, error: "That folder no longer exists — refresh and try again." },
          { status: 404 },
        );
      }
    }

    // "invoice.pdf" twice in one folder becomes "invoice (2).pdf", the way a
    // desktop file manager handles it. Dropping twenty files in at once should
    // not require the user to rename them first.
    const siblings = supabase
      .from(SHARED_FOLDER_TABLE)
      .select("name")
      .is("deleted_at", null)
      .eq("status", "ready");
    const { data: existing, error: sErr } = await (parentId
      ? siblings.eq("parent_id", parentId)
      : siblings.is("parent_id", null));
    if (sErr) throw sErr;

    const finalName = uniqueName(name, (existing ?? []).map((r) => r.name as string));

    // The id makes the path unique, so the filename component only has to be
    // URL-safe — the display name lives in the DB and is what the download
    // route serves the file as.
    const id = crypto.randomUUID();
    const path = `${id}/${safeStorageName(finalName)}`;

    const { data: signed, error: signErr } = await supabase.storage
      .from(SHARED_FOLDER_BUCKET)
      .createSignedUploadUrl(path);
    if (signErr || !signed) {
      // A missing bucket is the same operator problem as a missing table.
      const msg = signErr?.message ?? "unknown";
      if (/bucket not found/i.test(msg)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
      }
      log.error("shared_folder.sign_upload_failed", { message: msg });
      return NextResponse.json({ ok: false, error: `Storage signing failed: ${msg}` }, { status: 500 });
    }

    const { error: insErr } = await supabase.from(SHARED_FOLDER_TABLE).insert({
      id,
      parent_id: parentId,
      kind: "file",
      name: finalName,
      storage_path: path,
      mime_type: typeof body.mime_type === "string" ? body.mime_type : null,
      size_bytes: body.size,
      status: "pending",
      created_by: auth,
      updated_by: auth,
    });
    if (insErr) throw insErr;

    return NextResponse.json({
      ok: true,
      item_id: id,
      name: finalName,
      token: signed.token,
      path: signed.path,
      bucket: SHARED_FOLDER_BUCKET,
    });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    log.error("shared_folder.upload_url_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not start the upload" }, { status: 500 });
  }
}
