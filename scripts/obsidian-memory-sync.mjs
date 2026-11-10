#!/usr/bin/env node
/**
 * obsidian-memory-sync.mjs — two-way bridge between the CRM's Supabase memory
 * store (crm_memory) and the NextKey_CRM_Brain Obsidian vault.
 *
 * Runs on the NEXUS box (where the vault physically lives in OneDrive). Talks
 * to Supabase directly over PostgREST with the service key — NOT through the
 * CRM API, so it sidesteps Cloudflare Access entirely. Zero npm dependencies:
 * uses Node 18+ global fetch and the built-in fs module only.
 *
 * What it does each run:
 *   PULL  Supabase → vault : rows changed since last pull become / update
 *                            markdown files (frontmatter + body + [[wikilinks]]).
 *   PUSH  vault → Supabase : markdown files edited since last push are upserted
 *                            back by slug; embeddings regenerated if a key is set.
 *
 * Loop-safety: a .sync-state.json tracks last pull/push timestamps and a content
 * hash per slug, so a row this script just wrote doesn't bounce back as an edit.
 * Conflicts resolve last-writer-wins (newer of updated_at vs file mtime) with a
 * logged warning.
 *
 * Config (env, or a .env file beside this script — KEY=VALUE lines):
 *   SUPABASE_URL            https://xxxx.supabase.co        (required)
 *   SUPABASE_SERVICE_KEY    service-role key                (required)
 *   CRM_BRAIN_VAULT         path to the NextKey_CRM_Brain vault dir (required)
 *   EMBEDDINGS_API_KEY      OpenAI key (optional; enables push-side re-embed)
 *   EMBEDDINGS_BASE_URL     optional OpenAI-compatible base
 *   EMBEDDINGS_MODEL        default text-embedding-3-small
 *
 * Usage:
 *   node obsidian-memory-sync.mjs           # full two-way sync
 *   node obsidian-memory-sync.mjs --pull    # Supabase → vault only
 *   node obsidian-memory-sync.mjs --push    # vault → Supabase only
 *   node obsidian-memory-sync.mjs --dry-run # report, write nothing
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── config ───────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(HERE, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const VAULT = process.env.CRM_BRAIN_VAULT || "";
const EMB_KEY = process.env.EMBEDDINGS_API_KEY || "";
const EMB_BASE = (process.env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || "text-embedding-3-small";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run");
const DO_PULL = args.has("--pull") || (!args.has("--push") && !args.has("--pull"));
const DO_PUSH = args.has("--push") || (!args.has("--push") && !args.has("--pull"));

if (!SUPABASE_URL || !SERVICE_KEY || !VAULT) {
  console.error(
    "Missing config. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, CRM_BRAIN_VAULT " +
      "(env or .env beside the script).",
  );
  process.exit(1);
}

const STATE_PATH = path.join(VAULT, ".sync-state.json");
const EPOCH = "1970-01-01T00:00:00Z";

// ── tiny helpers ───────────────────────────────────────────────────────────────
const log = (...a) => console.log("[memory-sync]", ...a);
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return { lastPull: EPOCH, lastPush: EPOCH, hashes: {} };
  }
}
function writeState(state) {
  if (DRY) return;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// PostgREST helpers
async function sb(method, pathAndQuery, body, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Supabase ${method} ${pathAndQuery} → ${res.status} ${await res.text()}`);
  }
  // Don't assume a JSON body: Prefer:return=minimal yields 201/204 with an EMPTY
  // body, and res.json() on empty input throws "Unexpected end of JSON input".
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function embed(text) {
  if (!EMB_KEY) return null;
  try {
    const res = await fetch(`${EMB_BASE}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${EMB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMB_MODEL, input: text.slice(0, 8000) }),
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const j = await res.json();
    return j.data?.[0]?.embedding ?? null;
  } catch (e) {
    log("WARN embed failed (leaving vector unchanged):", e.message);
    return null;
  }
}

// ── markdown <-> row ───────────────────────────────────────────────────────────
const FM_KEYS = [
  "id", "slug", "kind", "source", "entity_type", "entity_id",
  "tags", "links", "confidence", "usefulness", "usage_count",
  "created_at", "updated_at",
];

function toMarkdown(row) {
  const fm = ["---"];
  for (const k of FM_KEYS) {
    let v = row[k];
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v = JSON.stringify(v); // valid YAML flow sequence
    else if (typeof v === "string") v = JSON.stringify(v);
    fm.push(`${k}: ${v}`);
  }
  fm.push("---", "");
  let out = fm.join("\n") + `# ${row.title}\n\n${row.body || ""}\n`;
  const links = Array.isArray(row.links) ? row.links.filter(Boolean) : [];
  if (links.length) {
    out += `\n## Related\n` + links.map((s) => `- [[${s}]]`).join("\n") + "\n";
  }
  return out;
}

function parseMarkdown(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const front = {};
  let bodyRaw = text;
  if (m) {
    bodyRaw = m[2];
    for (const line of m[1].split("\n")) {
      const mm = line.match(/^([a-z_]+):\s*(.*)$/);
      if (!mm) continue;
      const key = mm[1];
      let val = mm[2].trim();
      if (val.startsWith("[")) {
        try { val = JSON.parse(val); } catch { val = []; }
      } else if (val.startsWith('"')) {
        try { val = JSON.parse(val); } catch { val = val.replace(/^"|"$/g, ""); }
      } else if (/^-?\d+(\.\d+)?$/.test(val)) {
        val = Number(val);
      }
      front[key] = val;
    }
  }
  // Strip leading "# title", a trailing "## Related" wikilink block, derive title.
  let body = bodyRaw.replace(/^\s*#\s+(.*)\n+/, (_x, t) => { front.__title = t.trim(); return ""; });
  body = body.replace(/\n##\s+Related\n(?:- \[\[[^\]]+\]\]\n?)*\s*$/, "").trim();
  return { front, body };
}

// ── PULL: Supabase → vault ──────────────────────────────────────────────────────
async function pull(state) {
  const since = encodeURIComponent(state.lastPull || EPOCH);
  const rows = await sb(
    "GET",
    `crm_memory?archived=eq.false&updated_at=gt.${since}&order=updated_at.asc&select=*`,
  );
  let written = 0,
    newest = state.lastPull || EPOCH;
  for (const row of rows) {
    if (row.updated_at > newest) newest = row.updated_at;
    const dir = path.join(VAULT, String(row.kind || "learning"));
    const file = path.join(dir, `${row.slug}.md`);
    const md = toMarkdown(row);
    const h = sha(md);
    // Skip if the vault already holds this exact content (avoids loop churn).
    if (state.hashes[row.slug] === h && fs.existsSync(file)) continue;
    if (!DRY) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, md);
    }
    state.hashes[row.slug] = h;
    written++;
  }
  state.lastPull = newest;
  log(`pull: ${rows.length} changed row(s), ${written} file(s) written${DRY ? " (dry)" : ""}`);
}

// ── PUSH: vault → Supabase ──────────────────────────────────────────────────────
function walkMd(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(full, acc);
    else if (e.name.endsWith(".md")) acc.push(full);
  }
  return acc;
}

async function push(state) {
  const files = walkMd(VAULT);
  let upserts = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const h = sha(text);
    const { front, body } = parseMarkdown(text);
    const slug = front.slug || path.basename(file, ".md");
    if (!slug) continue;
    // Unchanged since we last saw it → nothing to push.
    if (state.hashes[slug] === h) continue;

    const title = front.__title || slug;
    const row = {
      slug,
      kind: front.kind || path.basename(path.dirname(file)) || "learning",
      title,
      body,
      source: front.source || "human",
      entity_type: front.entity_type ?? null,
      entity_id: front.entity_id ?? null,
      tags: Array.isArray(front.tags) ? front.tags : [],
      links: Array.isArray(front.links) ? front.links : [],
      confidence: typeof front.confidence === "number" ? front.confidence : 0.5,
      updated_at: new Date().toISOString(),
    };
    const vector = await embed(`${title}\n\n${body}`);
    if (vector) row.embedding = vector;

    if (!DRY) {
      // Upsert by slug (unique). Merge-duplicates resolves on the slug key.
      await sb("POST", "crm_memory?on_conflict=slug", row, {
        Prefer: "resolution=merge-duplicates,return=minimal",
      });
    }
    state.hashes[slug] = h;
    upserts++;
  }
  state.lastPush = new Date().toISOString();
  log(`push: ${files.length} file(s) scanned, ${upserts} upsert(s)${DRY ? " (dry)" : ""}`);
}

// ── main ────────────────────────────────────────────────────────────────────────
(async () => {
  const state = readState();
  if (!DRY) fs.mkdirSync(VAULT, { recursive: true });
  try {
    // Pull first so vault reflects latest, then push local edits on top.
    if (DO_PULL) await pull(state);
    if (DO_PUSH) await push(state);
    writeState(state);
    log("done.");
  } catch (e) {
    console.error("[memory-sync] FAILED:", e.message);
    process.exit(1);
  }
})();
