// Fill the Stock Map's suburb geocode cache (`stock_geocodes`) in one pass.
//
// Usage:
//   node --env-file=.env.local scripts/geocode-stock-suburbs.mjs --dry-run
//   node --env-file=.env.local scripts/geocode-stock-suburbs.mjs
//   node --env-file=.env.local scripts/geocode-stock-suburbs.mjs --retry-failed
//   node --env-file=.env.local scripts/geocode-stock-suburbs.mjs --limit=20
//
// The map at /properties/map can do this from the browser in small batches, but
// for the first fill (~170 suburbs) this is the sane path: Nominatim's usage
// policy is a hard 1 request/second, so a full pass takes ~3 minutes — longer
// than a Netlify function may run.
//
// Resumable and idempotent: suburbs already cached are skipped, so re-running
// after new stock arrives only geocodes what's new. Misses are cached too
// (failed=true) and skipped on later runs unless --retry-failed is passed.
//
// Prereq: migrations/20260909_stock_geocodes.sql applied in Supabase.

import { createClient } from "@supabase/supabase-js";

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);
const DRY_RUN = !!args["dry-run"];
const RETRY_FAILED = !!args["retry-failed"];
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY are required.\n" +
      "Run with: node --env-file=.env.local scripts/geocode-stock-suburbs.mjs",
  );
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mirrors utils/geo/suburbs.ts — keep the two in step or the cache splits.
const AU_BOUNDS = { minLat: -44.0, maxLat: -9.0, minLng: 112.0, maxLng: 154.0 };
const STATE_FULL = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

function suburbKey(suburb, state) {
  const sub = (suburb ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!sub) return null;
  const st = (state ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return `${sub}|${st}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocodeSuburb(suburb, state) {
  const params = new URLSearchParams({
    city: suburb,
    country: "Australia",
    format: "json",
    limit: "1",
    countrycodes: "au",
  });
  const full = state ? STATE_FULL[state.toUpperCase()] : null;
  if (full) params.set("state", full);

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { "User-Agent": "NextKey-CRM-StockMap/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;
    const hit = (await res.json())?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < AU_BOUNDS.minLat || lat > AU_BOUNDS.maxLat) return null;
    if (lng < AU_BOUNDS.minLng || lng > AU_BOUNDS.maxLng) return null;
    return { lat, lng, display: hit.display_name ?? `${suburb}, ${state ?? "AU"}` };
  } catch (e) {
    console.warn(`  ! network error: ${e.message}`);
    return null;
  }
}

// ---------- 1. every suburb we hold active stock in ----------
async function activeSuburbs() {
  const out = new Map(); // key -> { suburb, state, count }
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("global_stock_pool")
      .select("suburb,state")
      .not("pipeline_status", "in", "(withdrawn,legacy)")
      .range(from, from + 999);
    if (error) throw new Error(`global_stock_pool read failed: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      const key = suburbKey(row.suburb, row.state);
      if (!key) continue;
      const existing = out.get(key);
      if (existing) existing.count += 1;
      else
        out.set(key, {
          suburb: (row.suburb ?? "").trim(),
          state: (row.state ?? "").trim() || null,
          count: 1,
        });
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

// ---------- 2. what's already cached ----------
async function cachedKeys() {
  const hit = new Set();
  const failed = new Set();
  let from = 0;
  for (;;) {
    const { data, error } = await db
      .from("stock_geocodes")
      .select("key,failed")
      .range(from, from + 999);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        console.error(
          "ERROR: table `stock_geocodes` does not exist.\n" +
            "Apply migrations/20260909_stock_geocodes.sql in the Supabase SQL editor first.",
        );
        process.exit(1);
      }
      throw new Error(`stock_geocodes read failed: ${error.message}`);
    }
    if (!data?.length) break;
    for (const row of data) (row.failed ? failed : hit).add(row.key);
    if (data.length < 1000) break;
    from += 1000;
  }
  return { hit, failed };
}

// ---------- main ----------
const suburbs = await activeSuburbs();
const { hit, failed } = await cachedKeys();

let todo = [...suburbs.entries()].filter(([key]) => {
  if (hit.has(key)) return false;
  if (failed.has(key)) return RETRY_FAILED;
  return true;
});
// Biggest suburbs first, so an interrupted run has still mapped the most stock.
todo.sort((a, b) => b[1].count - a[1].count);
if (LIMIT) todo = todo.slice(0, LIMIT);

const coveredStock = [...suburbs.values()].reduce((n, s) => n + s.count, 0);
console.log(
  `${suburbs.size} distinct suburbs across ${coveredStock} active properties\n` +
    `  cached: ${hit.size} located, ${failed.size} previously not found\n` +
    `  to do:  ${todo.length}${RETRY_FAILED ? " (including retries)" : ""}`,
);

if (todo.length === 0) {
  console.log("\nNothing to geocode. Cache is up to date.");
  process.exit(0);
}
if (DRY_RUN) {
  console.log("\n--dry-run — would geocode:");
  for (const [key, s] of todo) console.log(`  ${key}  (${s.count} properties)`);
  process.exit(0);
}

console.log(`\nGeocoding at 1/sec — about ${Math.ceil((todo.length * 1.1) / 60)} min.\n`);

let ok = 0;
let miss = 0;
for (const [key, s] of todo) {
  const result = await geocodeSuburb(s.suburb, s.state);
  const { error } = await db.from("stock_geocodes").upsert(
    {
      key,
      suburb: s.suburb,
      state: s.state,
      lat: result?.lat ?? null,
      lng: result?.lng ?? null,
      display: result?.display ?? null,
      failed: !result,
      attempts: 1,
      precision: "suburb",
      provider: "nominatim",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) console.warn(`  ! cache write failed for ${key}: ${error.message}`);

  if (result) {
    ok += 1;
    console.log(`  ✓ ${key}  ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}  (${s.count})`);
  } else {
    miss += 1;
    console.log(`  ✗ ${key}  not found  (${s.count} properties)`);
  }

  // Nominatim usage policy: 1 request per second, absolute.
  await sleep(1100);
}

console.log(
  `\nDone. ${ok} located, ${miss} not found.` +
    (miss
      ? "\nNot-found suburbs are usually estate names or typos in the source" +
        " stocklist — fix the row in global_stock_pool, then re-run with --retry-failed."
      : ""),
);
