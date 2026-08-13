// File a document into the CRM Shared Folder (crm.nextkey.com.au/shared-folder)
// from a terminal or an agent session.
//
// Why this exists: the folder is deliberately behind Cloudflare Access, so
// there is no way to reach it from a script through the web app — an agent
// session has no browser and no Access identity. This talks to Supabase
// directly with the service-role key, doing exactly what the /api/shared-folder
// routes do: create any missing folders in the path, de-duplicate the filename
// against its siblings, upload the bytes, then insert the row as 'ready'.
//
// Usage:
//   node --env-file=.env.local scripts/shared-folder-put.mjs "NextKey/Reports" ./report.pdf
//   node --env-file=.env.local scripts/shared-folder-put.mjs "Springboard/Marketing/2026-08" a.png b.png
//   node --env-file=.env.local scripts/shared-folder-put.mjs --as="Q3 Board Pack.pdf" "NextKey/Reports" ./out.pdf
//   node --env-file=.env.local scripts/shared-folder-put.mjs --mkdir "Datum/Legal & Compliance"
//   node --env-file=.env.local scripts/shared-folder-put.mjs --ls "NextKey"
//
// Folder paths are "/"-separated and matched case-insensitively, so
// "nextkey/reports" lands in the existing "NextKey/Reports" rather than
// creating a second one. Missing folders are created as needed.
//
// Everything written here is visible to every person in the organisation —
// the folder has no per-user permissions. Do not file anything that should be
// restricted (see CLAUDE.md § Shared Folder).

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

// ---------- args ----------
const raw = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of raw) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) flags[m[1]] = m[2] ?? true;
  else positional.push(a);
}

const MKDIR_ONLY = !!flags.mkdir;
const LS_ONLY = !!flags.ls;
const AS_NAME = typeof flags.as === "string" ? flags.as : null;

// --mkdir / --ls take the path as the flag value OR the first positional.
const destPath =
  (typeof flags.mkdir === "string" && flags.mkdir) ||
  (typeof flags.ls === "string" && flags.ls) ||
  positional.shift() ||
  "";
const localFiles = positional;

if (!MKDIR_ONLY && !LS_ONLY && localFiles.length === 0) {
  console.error(
    'ERROR: nothing to upload.\n' +
      '  node --env-file=.env.local scripts/shared-folder-put.mjs "Business/Subfolder" ./file.pdf',
  );
  process.exit(1);
}
if (AS_NAME && localFiles.length > 1) {
  console.error("ERROR: --as renames a single file; you passed several.");
  process.exit(1);
}

// ---------- env ----------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "ERROR: SUPABASE creds missing. Run with: node --env-file=.env.local scripts/shared-folder-put.mjs ...",
  );
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLE = "shared_folder_items";
const BUCKET = "shared-folder";
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // keep in step with utils/shared-folder.ts
// Provenance: a human opening the folder should be able to tell at a glance
// that a file was filed by an agent session rather than typed in by a person.
const ACTOR = process.env.SHARED_FOLDER_ACTOR || "claude-code@nextkey.com.au";

// ---------- helpers (mirrors of utils/shared-folder.ts) ----------
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function sanitiseName(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(CONTROL_CHARS, "").replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return cleaned.length > 200 ? null : cleaned;
}

function safeStorageName(name) {
  const safe = name
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^[_.]+/, "")
    .replace(/_+$/, "")
    .slice(0, 80);
  return safe || "file";
}

function splitExtension(name) {
  const i = name.lastIndexOf(".");
  if (i <= 0 || i === name.length - 1) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

function uniqueName(desired, taken) {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(desired.toLowerCase())) return desired;
  const { base, ext } = splitExtension(desired);
  for (let n = 2; n < 500; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${Date.now()})${ext}`;
}

const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".zip": "application/zip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
};
const mimeFor = (name) => MIME[splitExtension(name).ext.toLowerCase()] ?? "application/octet-stream";

// ---------- folder resolution ----------
async function childrenOf(parentId) {
  let q = supabase.from(TABLE).select("id,name,kind").is("deleted_at", null);
  q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
  const { data, error } = await q.limit(2000);
  if (error) throw error;
  return data ?? [];
}

/**
 * Walk "A/B/C", creating any missing level. Case-insensitive match so
 * "nextkey/reports" reuses "NextKey/Reports" instead of building a parallel
 * tree — the single most likely way a shared drive turns into a mess.
 * Returns the id of the deepest folder, or null for the root.
 */
async function ensureFolderPath(folderPath) {
  const segments = String(folderPath || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let parentId = null;
  for (let depth = 0; depth < segments.length; depth++) {
    const segment = segments[depth];
    const name = sanitiseName(segment);
    if (!name) throw new Error(`Bad folder name: "${segment}"`);

    const siblings = await childrenOf(parentId);
    const hit = siblings.find((c) => c.kind === "folder" && c.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      parentId = hit.id;
      continue;
    }

    const id = crypto.randomUUID();
    const { error } = await supabase.from(TABLE).insert({
      id,
      parent_id: parentId,
      kind: "folder",
      name,
      status: "ready",
      created_by: ACTOR,
      updated_by: ACTOR,
    });
    if (error) throw error;
    console.log(`  + created folder  ${segments.slice(0, depth + 1).join("/")}`);
    parentId = id;
  }
  return parentId;
}

async function putFile(parentId, localPath, asName) {
  const stat = fs.statSync(localPath);
  if (!stat.isFile()) throw new Error(`Not a file: ${localPath}`);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`${path.basename(localPath)} is ${stat.size} bytes — over the 2GB per-file limit`);
  }

  const desired = sanitiseName(asName || path.basename(localPath));
  if (!desired) throw new Error(`Bad file name: ${localPath}`);

  const siblings = await childrenOf(parentId);
  const name = uniqueName(
    desired,
    siblings.map((s) => s.name),
  );

  // The row id makes the storage path unique, so upload first and insert the
  // row as 'ready' — the pending/confirm dance only exists to protect the
  // browser path, where the bytes travel separately from the request.
  const id = crypto.randomUUID();
  const storagePath = `${id}/${safeStorageName(name)}`;
  const body = fs.readFileSync(localPath);

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, { contentType: mimeFor(name), upsert: false });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

  const { error: insErr } = await supabase.from(TABLE).insert({
    id,
    parent_id: parentId,
    kind: "file",
    name,
    storage_path: storagePath,
    mime_type: mimeFor(name),
    size_bytes: stat.size,
    status: "ready",
    created_by: ACTOR,
    updated_by: ACTOR,
  });
  if (insErr) {
    // Don't leave an unreferenced object behind if the row fails to land.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw insErr;
  }

  return { name, size: stat.size, renamed: name !== desired };
}

// ---------- run ----------
const folderUrl = (id) =>
  id ? `https://crm.nextkey.com.au/shared-folder?parent=${id}` : "https://crm.nextkey.com.au/shared-folder";

try {
  if (LS_ONLY) {
    const parentId = destPath ? await ensureFolderPath(destPath) : null;
    const rows = await childrenOf(parentId);
    rows.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    console.log(`\n${destPath || "(root)"} — ${rows.length} item(s)`);
    for (const r of rows) console.log(`  ${r.kind === "folder" ? "[dir]" : "     "} ${r.name}`);
    console.log(`\n${folderUrl(parentId)}\n`);
    process.exit(0);
  }

  const parentId = await ensureFolderPath(destPath);

  if (MKDIR_ONLY) {
    console.log(`\nReady: ${destPath}`);
    console.log(`${folderUrl(parentId)}\n`);
    process.exit(0);
  }

  let ok = 0;
  for (const f of localFiles) {
    try {
      const r = await putFile(parentId, f, AS_NAME);
      console.log(`  ↑ ${r.name}${r.renamed ? "  (renamed — name was taken)" : ""}  ${r.size} bytes`);
      ok += 1;
    } catch (e) {
      console.error(`  ! ${f}: ${e.message}`);
    }
  }

  console.log(`\nFiled ${ok}/${localFiles.length} into ${destPath || "(root)"}`);
  console.log(`${folderUrl(parentId)}\n`);
  process.exit(ok === localFiles.length ? 0 : 1);
} catch (e) {
  console.error(`ERROR: ${e.message ?? e}`);
  process.exit(1);
}
