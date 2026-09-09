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

type GeoHit = { lat: number; lng: number; display: string };

/**
 * Does this Nominatim result describe a populated place, rather than some other
 * feature that merely shares the name?
 *
 * Freeform search will happily return a road, a wetland or a railway station:
 * "Jiliby, NSW" matches *Big Jiliby Road* and "Lakelands, QLD" matches the
 * *Coombabah Lakelands Conservation Area*. Both are confidently wrong, which is
 * worse than no answer — the map would show stock sitting in a nature reserve.
 * `class=place` covers suburb/town/city/locality/islet; an administrative
 * boundary is how Nominatim returns most gazetted AU suburbs.
 */
export function isPlace(hit: { class?: string; type?: string }): boolean {
  if (hit.class === "place") return true;
  return hit.class === "boundary" && hit.type === "administrative";
}

/**
 * One Nominatim call. Returns null for anything that isn't a usable AU point.
 *
 * `placeOnly` applies the feature-class filter. It's off for the structured
 * query (whose `city=` parameter already constrains to place types) and on for
 * the freeform fallback, which has no such constraint.
 */
async function nominatim(
  params: URLSearchParams,
  label: string,
  timeoutMs: number,
  placeOnly = false,
): Promise<GeoHit | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NextKey-CRM-StockMap/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;

    const arr = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      class?: string;
      type?: string;
    }>;
    // Scan the returned candidates rather than only the top one: the best
    // place-type match is often ranked below a road or reserve of the same name.
    const hit = (arr ?? []).find((h) => h?.lat && h?.lon && (!placeOnly || isPlace(h)));
    if (!hit?.lat || !hit?.lon) return null;

    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    // Belt and braces on top of countrycodes=au — a point outside Australia is
    // always wrong here, whatever the geocoder thinks it matched.
    if (lat < AU_BOUNDS.minLat || lat > AU_BOUNDS.maxLat) return null;
    if (lng < AU_BOUNDS.minLng || lng > AU_BOUNDS.maxLng) return null;

    return { lat, lng, display: hit.display_name ?? label };
  } catch {
    // Abort / network / parse — all "no result"; the caller records the attempt.
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Geocode one suburb, structured query first and freeform as a fallback.
 *
 * The structured form (city/state/country) is tried first because it is the
 * precise one — it pins the state, so "Richmond" resolves to the Richmond in
 * the state we hold stock in rather than whichever ranks highest.
 *
 * But Nominatim's `city=` only matches place types it considers a city or
 * suburb, so genuine localities fall straight through it: "Canberra City" and
 * "Chevron Island" are both real and both return nothing structured. Hence
 * freeform fallback.
 *
 * Freeform is safe *here* only because `countrycodes=au` is pinned — that is
 * what stops the classic "Springfield, QLD" → Springfield, Missouri failure.
 * Never drop that parameter. The state is still verified against the returned
 * display name when we have one, so a fallback can't silently place Richmond
 * VIC stock in Richmond NSW.
 */
export async function geocodeSuburb(
  suburb: string,
  state: string | null,
  timeoutMs = 8000,
): Promise<GeoHit | null> {
  const label = `${suburb}, ${state ?? "AU"}`;
  const full = state ? STATE_FULL[state.toUpperCase()] : null;

  // Tier 1 — structured, state-pinned.
  const structured = new URLSearchParams({
    city: suburb,
    country: "Australia",
    format: "json",
    limit: "1",
    countrycodes: "au",
  });
  if (full) structured.set("state", full);

  const hit = await nominatim(structured, label, timeoutMs);
  if (hit) return hit;

  // Tier 2 — freeform, for localities `city=` won't match.
  await new Promise((r) => setTimeout(r, 1100)); // Nominatim: 1 req/sec.

  const freeform = new URLSearchParams({
    // limit=5, not 1: the place-type match is often outranked by a road or
    // reserve sharing the name, so we need candidates to filter through.
    q: full ? `${suburb}, ${full}, Australia` : `${suburb}, Australia`,
    format: "json",
    limit: "5",
    countrycodes: "au",
    addressdetails: "1",
  });

  const loose = await nominatim(freeform, label, timeoutMs, true);
  if (!loose) return null;

  // Guard the looser query: if we asked for a state, the match must actually
  // be in it. Without this, freeform will cheerfully return the same-named
  // suburb in another state.
  if (full && !loose.display.toLowerCase().includes(full.toLowerCase())) return null;

  return loose;
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
