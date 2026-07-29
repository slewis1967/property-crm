#!/usr/bin/env node
/**
 * Bundle data/lender-policies/*.json into utils/lender-policy/pack.generated.ts.
 *
 * Run after any research pass:
 *   node scripts/build-lender-pack.mjs
 *
 * WHY A GENERATED MODULE rather than reading the directory at runtime:
 * the fallback library has to work inside a Netlify serverless function, where
 * `fs` reads of repo files depend on output-file tracing picking the directory
 * up — fragile, and it fails silently by returning an empty library, which
 * looks exactly like "no lenders researched yet". Bundling makes it a build-time
 * guarantee instead.
 *
 * WHY THE JSON IS EMBEDDED AS A STRING and parsed at load, rather than written
 * as an object literal: a hundred lender records is a lot of deeply nested
 * object literal for `tsc --noEmit` to infer types for on every typecheck, for
 * no benefit — the value is cast to LenderPolicy[] immediately anyway. A string
 * costs the compiler nothing.
 *
 * The per-lender JSON files stay the reviewable source of truth; this file is
 * a build artifact that happens to be committed so the deploy doesn't need a
 * generation step.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "data", "lender-policies");
const outFile = join(root, "utils", "lender-policy", "pack.generated.ts");

const files = readdirSync(dataDir)
  .filter((f) => f.endsWith(".json") && f !== "pack.json")
  .sort();

const policies = [];
const problems = [];

for (const file of files) {
  const raw = readFileSync(join(dataDir, file), "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    problems.push(`${file}: invalid JSON — ${err.message}`);
    continue;
  }
  const expectedId = file.replace(/\.json$/, "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push(`${file}: expected a single policy object`);
    continue;
  }
  if (!parsed.id) {
    // The filename IS the id by convention; fill it rather than reject.
    parsed.id = expectedId;
  } else if (parsed.id !== expectedId) {
    problems.push(`${file}: id "${parsed.id}" does not match the filename`);
    continue;
  }
  if (!parsed.name) {
    problems.push(`${file}: no lender name`);
    continue;
  }
  policies.push(parsed);
}

policies.sort((a, b) => String(a.id).localeCompare(String(b.id)));

const json = JSON.stringify(policies, null, 2);
// Escape only what a template literal can't carry verbatim.
const embedded = json.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

const header = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: data/lender-policies/*.json
 * Rebuild: node scripts/build-lender-pack.mjs
 *
 * The committed research pack, bundled so the lender library works before (and
 * without) the Supabase migration being applied. Every value in here carries a
 * source URL and an as-at date; anything that doesn't is demoted to
 * \`unverified\` by utils/lender-policy/verify.ts and excluded from matching.
 */
import type { LenderPolicy } from "./types";

const RAW = \`${embedded}\`;

/** ${policies.length} lender policy records. */
const PACK = JSON.parse(RAW) as LenderPolicy[];

export default PACK;
`;

writeFileSync(outFile, header, "utf8");

console.log(`Wrote ${policies.length} lender policies to utils/lender-policy/pack.generated.ts`);
if (problems.length > 0) {
  console.log(`\n${problems.length} file(s) skipped:`);
  for (const p of problems) console.log(`  - ${p}`);
  process.exitCode = problems.length === files.length ? 1 : 0;
}
