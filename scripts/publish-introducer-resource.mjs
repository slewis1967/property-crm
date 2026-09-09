#!/usr/bin/env node
/**
 * Publish a PDF to the introducer document library.
 *
 *   node scripts/publish-introducer-resource.mjs \
 *     --slug policy-manual \
 *     --title "Introducer Policy & Procedures Manual" \
 *     --file "C:/path/to/manual.pdf" \
 *     --version 1.0 \
 *     --category manual \
 *     --description "..." \
 *     --requires-ack \
 *     --publish
 *
 * WHY --publish IS OPT-IN. Without it the row is written unpublished, so the
 * document can be uploaded, opened, and checked before any introducer can see
 * it. Uploading and publishing in one unavoidable step is how a draft compliance
 * manual reaches an audience.
 *
 * Re-running with the same --slug replaces the document in place: same row, same
 * shelf position, new file. Bump --version when the CONTENT changes, because
 * that is what voids the existing acknowledgements and asks everyone to read it
 * again. Do not bump it for a typo fix nobody needs to re-read.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "introducer-library";
const CATEGORIES = ["manual", "reference", "agreement", "marketing"];

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);

function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const slug = arg("slug");
const title = arg("title");
const file = arg("file");
const version = arg("version", "1.0");
const category = arg("category", "reference");
const description = arg("description", "");
const sortOrder = Number(arg("sort-order", "100"));

if (!slug || !title || !file) die("Required: --slug, --title, --file");
if (!CATEGORIES.includes(category)) die(`--category must be one of: ${CATEGORIES.join(", ")}`);
if (!Number.isFinite(sortOrder)) die("--sort-order must be a number");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) die("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY first.");

const supabase = createClient(url, key, { auth: { persistSession: false } });

const bytes = await readFile(file).catch((err) => die(`Can't read ${file}: ${err.message}`));

// A PDF starts with %PDF-. Checking is worth the four lines: the bucket accepts
// application/pdf on trust, and a mislabelled file would sit on the shelf
// looking correct until an introducer downloaded something unopenable.
if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
  die(`${file} does not look like a PDF (no %PDF- header).`);
}

const filename = basename(file);

// Versioned path, so replacing a document never overwrites the bytes an existing
// acknowledgement refers to. Storage is cheap; an unprovable "which document did
// they actually confirm?" is not.
const storagePath = `${slug}/${version.replace(/[^a-zA-Z0-9._-]/g, "-")}/${filename}`;

const up = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
  contentType: "application/pdf",
  upsert: true,
});
if (up.error) die(`Upload failed: ${up.error.message}`);
console.log(`  uploaded  ${BUCKET}/${storagePath}  (${bytes.length.toLocaleString()} bytes)`);

const row = {
  slug,
  title,
  description,
  category,
  storage_path: storagePath,
  filename,
  mime_type: "application/pdf",
  size_bytes: bytes.length,
  version,
  requires_ack: flag("requires-ack"),
  sort_order: sortOrder,
  published: flag("publish"),
};

const { data, error } = await supabase
  .from("introducer_resources")
  .upsert(row, { onConflict: "slug" })
  .select("id,published,version")
  .single();

if (error) die(`Writing the library row failed: ${error.message}`);

console.log(`  ${data.published ? "PUBLISHED" : "staged (not published)"}  ${title}  v${data.version}`);
console.log(`  id ${data.id}`);
if (!data.published) {
  console.log("\n  Re-run with --publish when you're happy with it.");
}
