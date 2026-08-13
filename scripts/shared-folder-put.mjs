// File a document into the CRM Shared Folder (crm.nextkey.com.au/shared-folder)
// from a terminal or an agent session.
//
// Why this exists: the folder is deliberately behind Cloudflare Access, so a
// script cannot reach it through the web app — an agent session has no browser
// and no Access identity. This goes to Supabase directly, doing what the
// /api/shared-folder routes do: create any missing folders in the path,
// de-duplicate the filename against its siblings, upload the bytes, insert the
// row as 'ready'.
//
// ZERO DEPENDENCIES, ON PURPOSE. This uses plain fetch against the PostgREST
// and Storage HTTP APIs rather than @supabase/supabase-js, so it runs from any
// directory with bare node — no node_modules, no install, and no dependence on
// which branch a given checkout happens to be sitting on. A standing filing
// rule is worthless if the tool only works from one working tree.
//
// Usage (the env file path is stable regardless of branch — .env.local is
// gitignored, so it survives every checkout):
//   node --env-file=~/property-crm/.env.local shared-folder-put.mjs "NextKey/Reports" ./report.pdf
//   node --env-file=.env.local scripts/shared-folder-put.mjs "Springboard Homes/Marketing" a.png b.png
//   node --env-file=.env.local scripts/shared-folder-put.mjs --as="Q3 Board Pack.pdf" "NextKey/Reports" ./out.pdf
//   node --env-file=.env.local scripts/shared-folder-put.mjs --mkdir "Datum/Legal"
//   node --env-file=.env.local scripts/shared-folder-put.mjs --ls "NextKey"
//
// Folder paths are "/"-separated and matched case-insensitively, so
// "nextkey/reports" lands in the existing "NextKey/Reports" rather than
// creating a second one. Missing folders are created as needed.
//
// Everything written here is visible to every person in the organisation —
// the folder has no per-user permissions. Do not file credentials, or personal
// or client-confidential material beyond what the team already sees.
// See CLAUDE.md § Shared Folder.

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
    "ERROR: nothing to upload.\n" +
      '  node --env-file=.env.local scripts/shared-folder-put.mjs "Business/Subfolder" ./file.pdf',
  );
  process.exit(1);
}
if (AS_NAME && localFiles.length > 1) {
  console.error("ERROR: --as renames a single file; you passed several.");
  process.exit(1);
}

// ---------- env ----------
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "ERROR: Supabase creds missing. Run with:\n" +
      "  node --env-file=<path-to>/property-crm/.env.local <this-script> ...",
  );
  process.exit(1);
}

const TABLE = "shared_folder_items";
const BUCKET = "shared-folder";
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // keep in step with utils/shared-folder.ts
// Provenance: someone opening the folder should be able to tell at a glance
// that a file was filed by an agent session rather than uploaded by a person.
const ACTOR = process.env.SHARED_FOLDER_ACTOR || "claude-code@nextkey.com.au";

const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// ---------- tiny REST layer ----------
async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: { ...authHeaders, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`REST ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function storageUpload(objectPath, body, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": contentType, "x-upsert": "false" },
    body,
  });
  if (!res.ok) throw new Error(`Storage ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function storageRemove(objectPath) {
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "DELETE",
    headers: authHeaders,
  }).catch(() => {});
}

// ---------- helpers (mirrors of utils/shared-folder.ts) ----------
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

function sanitiseName(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(CONTROL_CHARS, "").replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim();
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
  const parentFilter = parentId ? `parent_id=eq.${parentId}` : "parent_id=is.null";
  return rest(`${TABLE}?select=id,name,kind&${parentFilter}&deleted_at=is.null&limit=2000`);
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
    const name = sanitiseName(segments[depth]);
    if (!name) throw new Error(`Bad folder name: "${segments[depth]}"`);

    const siblings = await childrenOf(parentId);
    const hit = siblings.find((c) => c.kind === "folder" && c.name.toLowerCase() === name.toLowerCase());
    if (hit) {
      parentId = hit.id;
      continue;
    }

    const id = crypto.randomUUID();
    await rest(TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id,
        parent_id: parentId,
        kind: "folder",
        name,
        status: "ready",
        created_by: ACTOR,
        updated_by: ACTOR,
      }),
    });
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
  // row as 'ready' — the pending/confirm dance exists only to protect the
  // browser path, where the bytes travel separately from the request.
  const id = crypto.randomUUID();
  const storagePath = `${id}/${safeStorageName(name)}`;

  await storageUpload(storagePath, fs.readFileSync(localPath), mimeFor(name));

  try {
    await rest(TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
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
      }),
    });
  } catch (e) {
    // Don't leave an unreferenced object behind if the row fails to land.
    await storageRemove(storagePath);
    throw e;
  }

  return { name, size: stat.size, renamed: name !== desired };
}

// ---------- run ----------
const folderUrl = (id) =>
  id
    ? `https://crm.nextkey.com.au/shared-folder?parent=${id}`
    : "https://crm.nextkey.com.au/shared-folder";

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
