/**
 * GET  /api/shared-folder            — list one folder, search, or the trash
 * POST /api/shared-folder            — create a folder
 *
 * The org-wide shared file library. Everything here is readable and writable
 * by anyone who clears Cloudflare Access, which is the whole point: this is a
 * shared drive for the organisation, not per-user storage. requireAuth() is
 * still applied because these rows are NOT owner-scoped — the sentinel trick
 * that protects owner-scoped routes would let an unauthenticated caller read
 * everything here, so the explicit 401 is doing real work.
 *
 * Query params on GET:
 *   parent=<uuid>   folder to list; omitted = root
 *   q=<text>        search names across every folder (ignores `parent`)
 *   view=trash      list soft-deleted items instead
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  SHARED_FOLDER_TABLE,
  ITEM_COLUMNS,
  TREE_COLUMNS,
  MIGRATION_HINT,
  sharedFolderTableMissing,
  sanitiseName,
  uniqueName,
  buildBreadcrumbs,
  hasTrashedAncestor,
  indexById,
  type SharedFolderItem,
  type TreeNode,
} from "../../../utils/shared-folder";

export const dynamic = "force-dynamic";

/** Cap on rows returned in one listing. A folder with more than this is a
 *  sign someone needs subfolders, not a bigger page. */
const LIST_LIMIT = 500;

/** Folders are fetched whole for breadcrumbs and the move picker. */
const FOLDER_LIMIT = 2000;

/** Fetch every folder row (live + trashed) — cheap, and needed to reason
 *  about ancestry for breadcrumbs, the move picker and trash filtering. */
async function loadFolders(): Promise<TreeNode[]> {
  const { data, error } = await supabase
    .from(SHARED_FOLDER_TABLE)
    .select(TREE_COLUMNS)
    .eq("kind", "folder")
    .limit(FOLDER_LIMIT);
  if (error) throw error;
  return (data ?? []) as TreeNode[];
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const parent = url.searchParams.get("parent");
  const q = (url.searchParams.get("q") ?? "").trim();
  const trash = url.searchParams.get("view") === "trash";

  try {
    const folders = await loadFolders();
    const byId = indexById(folders);

    // A parent that has been trashed (or deleted outright) must not render as
    // a normal folder — bounce the caller to the root rather than showing an
    // empty listing they can upload into.
    if (parent && (!byId.has(parent) || byId.get(parent)?.deleted_at)) {
      return NextResponse.json({
        ok: true,
        items: [],
        folders,
        breadcrumbs: [],
        parent: null,
        stale_parent: true,
      });
    }

    let query = supabase.from(SHARED_FOLDER_TABLE).select(ITEM_COLUMNS);

    if (trash) {
      query = query.not("deleted_at", "is", null).order("deleted_at", { ascending: false });
    } else if (q) {
      // Search is global — people look for a file, not for where they filed it.
      query = query
        .is("deleted_at", null)
        .eq("status", "ready")
        .ilike("name", `%${q.replace(/[%_]/g, "\\$&")}%`)
        .order("name");
    } else {
      query = query
        .is("deleted_at", null)
        // Only 'ready' rows: a browser that died mid-upload leaves a 'pending'
        // row behind, and a listing entry whose bytes never arrived is worse
        // than no entry at all.
        .eq("status", "ready")
        // Folders first, then files, each alphabetical — the ordering every
        // file manager uses. Descending because 'folder' sorts after 'file'.
        .order("kind", { ascending: false })
        .order("name", { ascending: true });
      query = parent ? query.eq("parent_id", parent) : query.is("parent_id", null);
    }

    const { data, error } = await query.limit(LIST_LIMIT);
    if (error) throw error;

    let items = (data ?? []) as SharedFolderItem[];

    // Deleting a folder only stamps the folder itself, so its children keep
    // deleted_at NULL. Filter them out of search results, and out of the trash
    // list, so the user sees the one folder they deleted rather than every
    // file inside it.
    if (q) {
      items = items.filter((it) => !hasTrashedAncestor(it, byId));
    } else if (trash) {
      items = items.filter((it) => !hasTrashedAncestor(it, byId));
    }

    return NextResponse.json({
      ok: true,
      items,
      folders,
      breadcrumbs: buildBreadcrumbs(folders, parent),
      parent: parent ?? null,
    });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      // Code ships before the SQL is applied; an empty, working page beats a
      // 500 while someone gets to the Supabase editor.
      return NextResponse.json({
        ok: true,
        items: [],
        folders: [],
        breadcrumbs: [],
        parent: parent ?? null,
        migration_hint: MIGRATION_HINT,
      });
    }
    log.error("shared_folder.list_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not load the shared folder" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => ({}))) as {
    parent_id?: unknown;
    name?: unknown;
  };

  const name = sanitiseName(body.name);
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Give the folder a name (no slashes, 200 characters max)." },
      { status: 400 },
    );
  }
  const parentId = typeof body.parent_id === "string" && body.parent_id ? body.parent_id : null;

  try {
    if (parentId) {
      const { data: parent, error: pErr } = await supabase
        .from(SHARED_FOLDER_TABLE)
        .select("id,kind,deleted_at")
        .eq("id", parentId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!parent || parent.kind !== "folder" || parent.deleted_at) {
        return NextResponse.json({ ok: false, error: "That folder no longer exists." }, { status: 404 });
      }
    }

    // Two folders called "2026" side by side is confusing rather than useful,
    // so folder names are made distinct on creation the same way files are.
    const siblings = supabase
      .from(SHARED_FOLDER_TABLE)
      .select("name")
      .eq("kind", "folder")
      .is("deleted_at", null);
    const { data: existing, error: sErr } = await (parentId
      ? siblings.eq("parent_id", parentId)
      : siblings.is("parent_id", null));
    if (sErr) throw sErr;

    const finalName = uniqueName(name, (existing ?? []).map((r) => r.name as string));

    const { data: row, error } = await supabase
      .from(SHARED_FOLDER_TABLE)
      .insert({
        id: crypto.randomUUID(),
        parent_id: parentId,
        kind: "folder",
        name: finalName,
        status: "ready",
        created_by: auth,
        updated_by: auth,
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, item: row });
  } catch (e) {
    if (sharedFolderTableMissing(e)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    log.error("shared_folder.create_folder_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not create the folder" }, { status: 500 });
  }
}
