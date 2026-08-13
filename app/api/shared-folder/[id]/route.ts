/**
 * GET    /api/shared-folder/{id}   — short-lived signed download URL
 * PATCH  /api/shared-folder/{id}   — confirm an upload, rename, move, restore
 * DELETE /api/shared-folder/{id}   — soft delete, or ?permanent=1 to purge
 *
 * PATCH takes one of:
 *   { confirm: true }        pending → ready, once the bytes have landed
 *   { name: "..." }          rename (display name only — the object never moves)
 *   { parent_id: "..."|null } move to another folder, or to the root
 *   { restore: true }        pull back out of the trash
 * They can be combined; each is applied only if present.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  SHARED_FOLDER_TABLE,
  SHARED_FOLDER_BUCKET,
  ITEM_COLUMNS,
  TREE_COLUMNS,
  MIGRATION_HINT,
  sharedFolderTableMissing,
  sanitiseName,
  uniqueName,
  collectSubtreeIds,
  hasTrashedAncestor,
  indexById,
  type SharedFolderItem,
  type TreeNode,
} from "../../../../utils/shared-folder";

export const dynamic = "force-dynamic";

/** Generous enough for "click, then find the download shelf". */
const SIGNED_DOWNLOAD_TTL = 60 * 15;

/** Upper bound when walking the tree for a recursive purge. */
const TREE_LIMIT = 10000;

async function loadItem(id: string): Promise<SharedFolderItem | null> {
  const { data, error } = await supabase
    .from(SHARED_FOLDER_TABLE)
    .select(ITEM_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as SharedFolderItem | null) ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    if (item.kind !== "file" || !item.storage_path) {
      return NextResponse.json({ ok: false, error: "That's a folder, not a file." }, { status: 400 });
    }

    // `download` sets the Content-Disposition filename, which is why a rename
    // can be a pure DB update: the object keeps its original path but the
    // browser still saves it under the name shown in the listing.
    const { data, error } = await supabase.storage
      .from(SHARED_FOLDER_BUCKET)
      .createSignedUrl(item.storage_path, SIGNED_DOWNLOAD_TTL, { download: item.name });
    if (error || !data?.signedUrl) {
      log.error("shared_folder.sign_download_failed", { message: error?.message ?? "unknown" });
      return NextResponse.json({ ok: false, error: "Could not prepare the download" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: data.signedUrl, name: item.name });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    log.error("shared_folder.download_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not prepare the download" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as {
    confirm?: unknown;
    restore?: unknown;
    name?: unknown;
    parent_id?: unknown;
  };

  try {
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const patch: Record<string, unknown> = { updated_by: auth, updated_at: new Date().toISOString() };

    if (body.confirm === true) patch.status = "ready";

    if (body.restore === true) {
      patch.deleted_at = null;
      // Restoring into a folder that is itself still trashed would put the
      // item somewhere unreachable: invisible in the tree (its parent is
      // gone) and filtered out of the trash list (it is no longer deleted).
      // Send it to the root instead, which is what "restore" has to mean if
      // it is to be honest.
      const { data: folders, error: fErr } = await supabase
        .from(SHARED_FOLDER_TABLE)
        .select(TREE_COLUMNS)
        .eq("kind", "folder")
        .limit(TREE_LIMIT);
      if (fErr) throw fErr;
      if (hasTrashedAncestor(item, indexById((folders ?? []) as TreeNode[]))) {
        patch.parent_id = null;
      }
    }

    // Where the item will live once this PATCH lands — needed by both the
    // rename and the move so the uniqueness check runs against the right
    // sibling set when someone renames and moves in one go.
    const movingParent = "parent_id" in body;
    const targetParent = movingParent
      ? typeof body.parent_id === "string" && body.parent_id
        ? body.parent_id
        : null
      : item.parent_id;

    if (movingParent && targetParent !== item.parent_id) {
      if (targetParent) {
        const { data: dest, error: dErr } = await supabase
          .from(SHARED_FOLDER_TABLE)
          .select("id,kind,deleted_at")
          .eq("id", targetParent)
          .maybeSingle();
        if (dErr) throw dErr;
        if (!dest || dest.kind !== "folder" || dest.deleted_at) {
          return NextResponse.json({ ok: false, error: "That destination folder no longer exists." }, { status: 404 });
        }
      }

      // Moving a folder into its own subtree would orphan the whole branch
      // from the root — it would simply vanish from the UI with no way back.
      if (item.kind === "folder" && targetParent) {
        const { data: folders, error: fErr } = await supabase
          .from(SHARED_FOLDER_TABLE)
          .select(TREE_COLUMNS)
          .eq("kind", "folder")
          .limit(TREE_LIMIT);
        if (fErr) throw fErr;
        const subtree = new Set(collectSubtreeIds(item.id, (folders ?? []) as TreeNode[]));
        if (subtree.has(targetParent)) {
          return NextResponse.json(
            { ok: false, error: "You can't move a folder into itself." },
            { status: 400 },
          );
        }
      }
      patch.parent_id = targetParent;
    }

    // Read the destination back off `patch` rather than reusing targetParent:
    // a restore may already have redirected this item to the root, and the
    // rename below must check uniqueness against the siblings it will
    // actually land among.
    const landingParent =
      "parent_id" in patch ? (patch.parent_id as string | null) : item.parent_id;

    if (body.name !== undefined) {
      const name = sanitiseName(body.name);
      if (!name) {
        return NextResponse.json(
          { ok: false, error: "That name won't work — no slashes, 200 characters max." },
          { status: 400 },
        );
      }
      const siblings = supabase
        .from(SHARED_FOLDER_TABLE)
        .select("name")
        .is("deleted_at", null)
        .neq("id", id);
      const { data: existing, error: sErr } = await (landingParent
        ? siblings.eq("parent_id", landingParent)
        : siblings.is("parent_id", null));
      if (sErr) throw sErr;
      patch.name = uniqueName(name, (existing ?? []).map((r) => r.name as string));
    }

    const { data: row, error } = await supabase
      .from(SHARED_FOLDER_TABLE)
      .update(patch)
      .eq("id", id)
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    log.error("shared_folder.update_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not update that item" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const permanent = new URL(req.url).searchParams.get("permanent") === "1";

  try {
    const item = await loadItem(id);
    if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (!permanent) {
      // Soft delete. Anyone in the org can delete anything here, so the
      // default has to be recoverable — a stamped folder disappears from the
      // tree with its children intact, and Restore brings the whole branch
      // back.
      const { error } = await supabase
        .from(SHARED_FOLDER_TABLE)
        .update({ deleted_at: new Date().toISOString(), updated_by: auth })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, soft: true });
    }

    // Permanent: collect the whole subtree so the storage objects go too.
    // The DB rows below the root are removed by ON DELETE CASCADE, but
    // Storage knows nothing about foreign keys — without this the bucket
    // silently accumulates orphans forever.
    const { data: all, error: treeErr } = await supabase
      .from(SHARED_FOLDER_TABLE)
      .select(TREE_COLUMNS)
      .limit(TREE_LIMIT);
    if (treeErr) throw treeErr;

    const nodes = (all ?? []) as TreeNode[];
    const doomed = new Set(collectSubtreeIds(id, nodes));
    const paths = nodes
      .filter((n) => doomed.has(n.id) && n.storage_path)
      .map((n) => n.storage_path as string);

    if (paths.length > 0) {
      // Best-effort, and deliberately before the row delete: an orphaned
      // object can be swept later, an orphaned row cannot be traced back to
      // its object at all.
      const { error: rmErr } = await supabase.storage.from(SHARED_FOLDER_BUCKET).remove(paths);
      if (rmErr) log.error("shared_folder.storage_purge_failed", { message: rmErr.message, count: paths.length });
    }

    const { error: delErr } = await supabase.from(SHARED_FOLDER_TABLE).delete().eq("id", id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true, soft: false, purged: paths.length });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    log.error("shared_folder.delete_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not delete that item" }, { status: 500 });
  }
}
