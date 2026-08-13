/**
 * Shared Folder — pure helpers for the org-wide file library.
 *
 * Deliberately free of any Supabase import so both the server routes and the
 * `"use client"` browser component can pull from here. Anything that touches
 * the service-role client lives in the route files instead.
 *
 * See migrations/20260813_shared_folder.sql for the data model.
 */

export const SHARED_FOLDER_TABLE = "shared_folder_items";
export const SHARED_FOLDER_BUCKET = "shared-folder";

/**
 * Per-file ceiling. Mirrors the bucket's file_size_limit in the migration —
 * change both together.
 *
 * 2GB is a deliberate stop short of Supabase's 5GB ceiling for *standard*
 * uploads, which is the single-PUT path `uploadToSignedUrl` uses. There is no
 * resume on that path: a transfer that drops at 90% starts again from zero,
 * and that gets genuinely painful well before 5GB. Raising this further means
 * switching to resumable/TUS uploads, which is a different piece of work.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

/** Longest display name we accept. Storage paths use a shortened, sanitised form. */
export const MAX_NAME_LENGTH = 200;

/** Every column of an item row, in one place so routes can't drift. */
export const ITEM_COLUMNS =
  "id,parent_id,kind,name,storage_path,mime_type,size_bytes,status,deleted_at,created_by,updated_by,created_at,updated_at";

/** Cheap columns for tree walks (breadcrumbs, move targets, cascade deletes). */
export const TREE_COLUMNS = "id,parent_id,kind,name,storage_path,deleted_at";

export const MIGRATION_HINT =
  "Shared Folder is not set up yet — run migrations/20260813_shared_folder.sql in the Supabase SQL editor.";

export type ItemKind = "folder" | "file";
export type ItemStatus = "pending" | "ready";

export type SharedFolderItem = {
  id: string;
  parent_id: string | null;
  kind: ItemKind;
  name: string;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: ItemStatus;
  deleted_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** The subset needed to reason about the tree. */
export type TreeNode = {
  id: string;
  parent_id: string | null;
  kind?: ItemKind;
  name?: string;
  storage_path?: string | null;
  deleted_at?: string | null;
};

/**
 * True when the failure is specifically "the table isn't there yet".
 *
 * Narrow on purpose, copying amlTableMissing: a missing COLUMN (PGRST204 /
 * 42703) is a schema mismatch, and telling an operator to re-run a migration
 * they already ran sends them in a circle.
 */
export function sharedFolderTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("could not find the table") ||
    (msg.includes("relation") && msg.includes("does not exist"))
  );
}

/** Control characters, stripped from any name before it reaches the DB. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/**
 * Clean a user-supplied display name, or null if it can't be salvaged.
 *
 * Path separators become "-": a name containing "/" would read as a folder
 * boundary everywhere we render a breadcrumb, and "." / ".." are filesystem
 * traversal shapes that should never become a row.
 */
export function sanitiseName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(CONTROL_CHARS, "")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  if (cleaned.length > MAX_NAME_LENGTH) return null;
  return cleaned;
}

/**
 * The filename component of the storage path.
 *
 * The row id already makes the path unique, so this only has to be safe for a
 * URL — it is never shown to anyone. The display name lives in the DB and is
 * what createSignedUrl({ download }) serves the file as.
 */
export function safeStorageName(name: string): string {
  const safe = name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^[_.]+/, "")
    .replace(/_+$/, "")
    .slice(0, 80);
  return safe || "file";
}

/** Split "report.final.pdf" into { base: "report.final", ext: ".pdf" }. */
export function splitExtension(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

/**
 * "invoice.pdf" → "invoice (2).pdf" when the name is already taken in this
 * folder. Matches what a desktop file manager does, and beats rejecting the
 * upload: someone dragging in twenty files should not have to babysit each one.
 * Comparison is case-insensitive because that is how people read a file list.
 */
export function uniqueName(desired: string, taken: Iterable<string>): string {
  const lower = new Set<string>();
  for (const t of taken) lower.add(t.toLowerCase());
  if (!lower.has(desired.toLowerCase())) return desired;

  const { base, ext } = splitExtension(desired);
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  // 500 same-named files in one folder is pathological; fall back to something
  // guaranteed distinct rather than looping forever.
  return `${base} (${Date.now()})${ext}`;
}

/** Index a node list by id. */
export function indexById<T extends TreeNode>(nodes: T[]): Map<string, T> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * The path from the root down to `folderId`, for the breadcrumb bar.
 * Returns [] for the root. Cycle-guarded — a self-referencing row from a bad
 * manual edit should render a short trail, not hang the request.
 */
export function buildBreadcrumbs(
  folders: TreeNode[],
  folderId: string | null,
): Array<{ id: string; name: string }> {
  const byId = indexById(folders);
  const trail: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    trail.unshift({ id: cur.id, name: cur.name ?? "(unnamed)" });
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return trail;
}

/**
 * True if any ancestor of `node` is trashed (or missing entirely).
 *
 * Deleting a folder only stamps the folder row, so its children keep
 * deleted_at NULL. Without this check a cross-folder search would surface
 * files the user believes they deleted.
 */
export function hasTrashedAncestor(node: TreeNode, byId: Map<string, TreeNode>): boolean {
  const seen = new Set<string>();
  let pid = node.parent_id;
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const parent = byId.get(pid);
    // Parent row gone: the node is unreachable from the tree, same as trashed.
    if (!parent) return true;
    if (parent.deleted_at) return true;
    pid = parent.parent_id;
  }
  return false;
}

/**
 * Every id in the subtree rooted at `rootId`, including `rootId` itself.
 * Used to gather storage objects before a permanent delete, and to stop a
 * folder being moved inside itself.
 */
export function collectSubtreeIds(rootId: string, nodes: TreeNode[]): string[] {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const list = children.get(n.parent_id);
    if (list) list.push(n.id);
    else children.set(n.parent_id, [n.id]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    const kids = children.get(id);
    if (kids) stack.push(...kids);
  }
  return out;
}

/** Human-readable file size. Folders pass null and get an em dash. */
export function fmtBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** A rough icon for the row, picked from the extension. Cosmetic only. */
export function iconFor(item: { kind: ItemKind; name: string }): string {
  if (item.kind === "folder") return "📁";
  const ext = splitExtension(item.name).ext.toLowerCase();
  if (ext === ".pdf") return "📕";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".svg"].includes(ext)) return "🖼️";
  if ([".xlsx", ".xls", ".csv"].includes(ext)) return "📊";
  if ([".doc", ".docx", ".rtf", ".txt", ".md"].includes(ext)) return "📄";
  if ([".ppt", ".pptx", ".key"].includes(ext)) return "📽️";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "🗜️";
  if ([".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext)) return "🎬";
  if ([".mp3", ".wav", ".m4a", ".aac"].includes(ext)) return "🎵";
  return "📎";
}
