/**
 * Suburb -> centroid, for the Stock Map (/properties/map).
 *
 * Why suburb-level and not per-property: global_stock_pool has no lat/lng
 * columns, and only ~61 of ~1,481 active rows carry a street_address. A
 * pin-per-property map would therefore show 4% of the stock. Every row does
 * have suburb + state, and those collapse to ~170 distinct places — so the
 * map plots one bubble per suburb, sized by how much stock sits there.
 *
 * Lookups are cached in `stock_geocodes` (migration 20260909). A suburb is
 * geocoded once, ever; misses are cached too so a junk suburb value doesn't
 * re-hit Nominatim on every load. Everything here is best-effort: a missing
 * table, a slow geocoder or a bad row degrades to "unlocated", never a throw.
 */

import { supabase } from "../supabase";
import { log, errInfo } from "../logger";

export type SuburbKey = string; // "SUBURB|STATE", normalised

export type SuburbPoint = {
  key: SuburbKey;
  suburb: string;
  state: string | null;
  lat: number;
  lng: number;
  display?: string | null;
};

/** Rough bounding box for Australia — used to reject off-continent matches. */
const AU_BOUNDS = { minLat: -44.0, maxLat: -9.0, minLng: 112.0, maxLng: 154.0 };

const STATE_FULL: Record<string, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  SA: "South Australia",
  WA: "Western Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

/**
 * Cache key for a suburb+state pair. Upper-cased and whitespace-collapsed so
 * "Cranbourne  East" and "CRANBOURNE EAST" resolve to one cache entry.
 */
export function suburbKey(
  suburb: string | null | undefined,
  state: string | null | undefined,
): SuburbKey | null {
  const sub = (suburb ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!sub) return null;
  const st = (state ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return `${sub}|${st}`;
}

export function splitKey(key: SuburbKey): { suburb: string; state: string | null } {
  const i = key.lastIndexOf("|");
  if (i < 0) return { suburb: key, state: null };
  const state = key.slice(i + 1).trim();
  return { suburb: key.slice(0, i), state: state || null };
}

/** True when the table simply hasn't been migrated yet (vs a real DB error). */
export function geocodeTableMissing(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) return false;
  // 42P01 = undefined_table; PGRST205 = PostgREST can't find it in the schema cache.
  return error.code === "42P01" || error.code === "PGRST205";
}

/**
 * Read whatever is already cached for these keys. Returns points for hits and
 * the set of keys known to have failed, so callers can tell "never tried" from
 * "tried, and Nominatim had nothing".
 */
export async function readCache(keys: SuburbKey[]): Promise<{
  points: Map<SuburbKey, SuburbPoint>;
  failed: Set<SuburbKey>;
  tableMissing: boolean;
}> {
  const points = new Map<SuburbKey, SuburbPoint>();
  const failed = new Set<SuburbKey>();
  if (keys.length === 0) return { points, failed, tableMissing: false };

  // Chunked so a large key list can't blow the URL length limit on
  // PostgREST's `in.(...)` filter.
  const CHUNK = 200;
  for (let i = 0; i < keys.length; i += CHUNK) {
    const slice = keys.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("stock_geocodes")
      .select("key,suburb,state,lat,lng,display,failed")
      .in("key", slice);

    if (error) {
      if (geocodeTableMissing(error)) return { points, failed, tableMissing: true };
      log.warn("stockmap.cache_read_failed", errInfo(error));
      return { points, failed, tableMissing: false };
    }

    for (const row of (data ?? []) as Array<{
      key: string;
      suburb: string;
      state: string | null;
      lat: number | null;
      lng: number | null;
      display: string | null;
      failed: boolean;
    }>) {
      if (row.failed) {
        failed.add(row.key);
      } else if (typeof row.lat === "number" && typeof row.lng === "number") {
        points.set(row.key, {
          key: row.key,
          suburb: row.suburb,
          state: row.state,
          lat: row.lat,
          lng: row.lng,
          display: row.display,
        });
      }
    }
  }
  return { points, failed, tableMissing: false };
}

/**
 * Geocode one suburb via Nominatim's structured query.
 *
 * Structured (city/state/country) rather than freeform: a freeform search for
 * "Springfield, QLD" happily returns Springfield, Missouri. The result is
 * additionally rejected if it lands outside the Australian bounding box.
 */
export async function geocodeSuburb(
  suburb: string,
  state: string | null,
  timeoutMs = 8000,
): Promise<{ lat: number; lng: number; display: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const params = new URLSearchParams({
      city: suburb,
      country: "Australia",
      format: "json",
      limit: "1",
      countrycodes: "au",
    });
    const full = state ? STATE_FULL[state.toUpperCase()] : null;
    if (full) params.set("state", full);

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NextKey-CRM-StockMap/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;

    const arr = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const hit = arr?.[0];
    if (!hit?.lat || !hit?.lon) return null;

    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    if (lat < AU_BOUNDS.minLat || lat > AU_BOUNDS.maxLat) return null;
    if (lng < AU_BOUNDS.minLng || lng > AU_BOUNDS.maxLng) return null;

    return { lat, lng, display: hit.display_name ?? `${suburb}, ${state ?? "AU"}` };
  } catch {
    // Abort / network / parse — all "no result"; the caller records the attempt.
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Upsert one cache row (hit or miss). Never throws. */
export async function writeCache(
  key: SuburbKey,
  suburb: string,
  state: string | null,
  hit: { lat: number; lng: number; display: string } | null,
  attempts: number,
): Promise<void> {
  try {
    const { error } = await supabase.from("stock_geocodes").upsert(
      {
        key,
        suburb,
        state,
        lat: hit?.lat ?? null,
        lng: hit?.lng ?? null,
        display: hit?.display ?? null,
        failed: !hit,
        attempts,
        precision: "suburb",
        provider: "nominatim",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error && !geocodeTableMissing(error)) {
      log.warn("stockmap.cache_write_failed", errInfo(error));
    }
  } catch (e) {
    log.warn("stockmap.cache_write_failed", errInfo(e));
  }
}

/**
 * Geocode up to `limit` uncached suburbs, one per second.
 *
 * The 1-per-second pause is Nominatim's published usage policy, not a guess —
 * exceeding it gets the CRM's IP blocked. `limit` is what keeps a serverless
 * invocation inside its timeout; for a bulk backfill the operator runs
 * scripts/geocode-stock-suburbs.mjs instead of hammering this from the browser.
 */
export async function geocodeMissing(
  keys: SuburbKey[],
  limit = 10,
): Promise<{ resolved: SuburbPoint[]; failed: SuburbKey[] }> {
  const resolved: SuburbPoint[] = [];
  const failed: SuburbKey[] = [];

  for (const key of keys.slice(0, limit)) {
    const { suburb, state } = splitKey(key);
    const hit = await geocodeSuburb(suburb, state);
    await writeCache(key, suburb, state, hit, 1);
    if (hit) {
      resolved.push({ key, suburb, state, lat: hit.lat, lng: hit.lng, display: hit.display });
    } else {
      failed.push(key);
    }
    await new Promise((r) => setTimeout(r, 1100));
  }

  return { resolved, failed };
}
