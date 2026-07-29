#!/usr/bin/env node
/**
 * Fetch every source URL in the committed research pack and report the dead ones.
 *
 *   node scripts/check-lender-sources.mjs
 *   node scripts/check-lender-sources.mjs --fix   # demote facts with dead sources
 *
 * WHY: a source URL is the only thing separating a policy fact from a rumour,
 * and lender websites reorganise constantly. A record whose citation 404s is
 * worse than no record — it still looks authoritative in the UI.
 *
 * `--fix` does not delete anything. It rewrites the affected facts to
 * confidence "low" with a note, which is enough for utils/lender-policy/verify.ts
 * to exclude them from matching while leaving them visible to a human who can
 * go and find the document's new home.
 *
 * Deliberately NOT part of the test suite: it hits the public internet, so it
 * would make CI flaky and fail on a lender's five-minute outage. Run it by hand
 * before publishing a tranche, or on a schedule.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data", "lender-policies");
const fix = process.argv.includes("--fix");

const SECTIONS = [
  "servicing",
  "lvr",
  "income",
  "employment",
  "credit",
  "security",
  "product",
  "residency",
];

const files = readdirSync(dataDir).filter((f) => f.endsWith(".json"));
const byUrl = new Map(); // url -> [{file, path}]

for (const file of files) {
  const policy = JSON.parse(readFileSync(join(dataDir, file), "utf8"));
  for (const section of SECTIONS) {
    for (const [field, fact] of Object.entries(policy[section] ?? {})) {
      if (!fact || typeof fact !== "object" || !fact.sourceUrl) continue;
      const list = byUrl.get(fact.sourceUrl) ?? [];
      list.push({ file, path: `${section}.${field}` });
      byUrl.set(fact.sourceUrl, list);
    }
  }
}

async function check(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Some bank sites reject HEAD outright, so use a ranged GET and a normal
    // user agent — a 403 from a bot filter is not evidence the page is gone.
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; NextKeyCRM-LenderPolicy/1.0; +policy source verification)",
        range: "bytes=0-2047",
      },
    });
    return { ok: res.status < 400, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: err.name === "AbortError" ? "timeout" : "unreachable" };
  } finally {
    clearTimeout(timer);
  }
}

const urls = [...byUrl.keys()];
const dead = [];
let done = 0;

// Bounded concurrency — a hundred simultaneous requests to a handful of bank
// domains looks like an attack and gets rate-limited into false negatives.
const CONCURRENCY = 5;
let cursor = 0;
async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= urls.length) return;
    const url = urls[i];
    const result = await check(url);
    done += 1;
    if (!result.ok) dead.push({ url, ...result, uses: byUrl.get(url) });
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

console.log(`Checked ${done} distinct source URLs across ${files.length} lender records.`);
console.log(`  resolved: ${done - dead.length}`);
console.log(`  dead:     ${dead.length}`);

if (dead.length === 0) process.exit(0);

console.log("");
for (const d of dead) {
  console.log(`✕ ${d.status ?? d.error}  ${d.url}`);
  for (const use of d.uses) console.log(`    ${use.file} → ${use.path}`);
}

if (!fix) {
  console.log("\nRe-run with --fix to demote these facts so they stop matching.");
  process.exit(1);
}

const deadUrls = new Set(dead.map((d) => d.url));
let demoted = 0;
for (const file of files) {
  const path = join(dataDir, file);
  const policy = JSON.parse(readFileSync(path, "utf8"));
  let touched = false;
  for (const section of SECTIONS) {
    for (const fact of Object.values(policy[section] ?? {})) {
      if (!fact || typeof fact !== "object" || !deadUrls.has(fact.sourceUrl)) continue;
      fact.confidence = "low";
      fact.note = `${fact.note ? `${fact.note} ` : ""}[Source URL no longer resolves as at ${new Date().toISOString().slice(0, 10)} — re-source before relying on this.]`;
      demoted += 1;
      touched = true;
    }
  }
  if (touched) writeFileSync(path, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}
console.log(`\nDemoted ${demoted} fact(s). Run \`node scripts/build-lender-pack.mjs\` to rebuild.`);
