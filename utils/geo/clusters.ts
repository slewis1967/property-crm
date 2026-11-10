/**
 * Roll active stock rows up into one cluster per suburb, for the Stock Map.
 *
 * Pure and side-effect free — the API route does the fetching and the geocode
 * lookup, this does the arithmetic. Kept separate so the aggregation is
 * vitest-testable without a Supabase or Nominatim round trip.
 */

import { suburbKey, type SuburbKey, type SuburbPoint } from "./suburbs";

/** The subset of global_stock_pool the map actually needs. */
export type StockRow = {
  id: string;
  suburb?: string | null;
  state?: string | null;
  builder_name?: string | null;
  estate_name?: string | null;
  property_type?: string | null;
  street_address?: string | null;
  lot_number?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  car_spaces?: number | null;
  land_size?: number | null;
  titled?: boolean | null;
  total_package_price?: number | null;
  house_price?: number | null;
};

/** One property as shown in the map's suburb drill-down panel. */
export type ClusterItem = {
  id: string;
  builder: string | null;
  estate: string | null;
  type: string | null;
  address: string | null;
  lot: string | null;
  beds: number | null;
  baths: number | null;
  cars: number | null;
  landSize: number | null;
  titled: boolean | null;
  price: number | null;
};

export type SuburbCluster = {
  key: SuburbKey;
  suburb: string;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  /** null when no row in the suburb carries a usable price. */
  minPrice: number | null;
  maxPrice: number | null;
  medianPrice: number | null;
  builders: string[];
  types: string[];
  items: ClusterItem[];
};

/** A suburb we have stock in but can't place on the map, and why. */
export type UnlocatedSuburb = {
  key: SuburbKey | null;
  suburb: string;
  state: string | null;
  count: number;
  reason: "no-suburb" | "not-geocoded" | "geocode-failed";
};

/**
 * The price the map ranks on: the full package where we have it, otherwise the
 * house price. Deliberately mirrors `price_total` in app/properties/page.tsx —
 * a suburb's price band must read the same here as it does on the feed.
 */
export function rowPrice(row: StockRow): number | null {
  const p = row.total_package_price ?? row.house_price;
  return typeof p === "number" && isFinite(p) && p > 0 ? p : null;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function toItem(row: StockRow): ClusterItem {
  return {
    id: row.id,
    builder: row.builder_name ?? null,
    estate: row.estate_name ?? null,
    type: row.property_type ?? null,
    address: row.street_address ?? null,
    lot: row.lot_number ?? null,
    beds: row.bedrooms ?? null,
    baths: row.bathrooms ?? null,
    cars: row.car_spaces ?? null,
    landSize: row.land_size ?? null,
    titled: row.titled ?? null,
    price: rowPrice(row),
  };
}

/**
 * Group rows by suburb and attach the cached centroid.
 *
 * Rows whose suburb we can't place come back in `unlocated` rather than being
 * silently dropped — a map that quietly loses 200 properties is worse than one
 * that says it couldn't place them.
 */
export function buildClusters(
  rows: StockRow[],
  points: Map<SuburbKey, SuburbPoint>,
  failedKeys: Set<SuburbKey>,
): { clusters: SuburbCluster[]; unlocated: UnlocatedSuburb[] } {
  const grouped = new Map<SuburbKey, StockRow[]>();
  const noSuburb: StockRow[] = [];

  for (const row of rows) {
    const key = suburbKey(row.suburb, row.state);
    if (!key) {
      noSuburb.push(row);
      continue;
    }
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }

  const clusters: SuburbCluster[] = [];
  const unlocated: UnlocatedSuburb[] = [];

  for (const [key, bucket] of grouped) {
    const point = points.get(key);
    // Display the suburb as it appears in the data (title-ish), not the
    // upper-cased cache key.
    const sample = bucket.find((r) => (r.suburb ?? "").trim());
    const suburb = (sample?.suburb ?? "").trim() || key.split("|")[0];
    const state = (sample?.state ?? "").trim() || null;

    if (!point) {
      unlocated.push({
        key,
        suburb,
        state,
        count: bucket.length,
        reason: failedKeys.has(key) ? "geocode-failed" : "not-geocoded",
      });
      continue;
    }

    const prices = bucket.map(rowPrice).filter((p): p is number => p != null);
    clusters.push({
      key,
      suburb,
      state,
      lat: point.lat,
      lng: point.lng,
      count: bucket.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      medianPrice: median(prices),
      builders: Array.from(
        new Set(bucket.map((r) => (r.builder_name ?? "").trim()).filter(Boolean)),
      ).sort(),
      types: Array.from(
        new Set(bucket.map((r) => (r.property_type ?? "").trim()).filter(Boolean)),
      ).sort(),
      items: bucket.map(toItem).sort((a, b) => (b.price ?? 0) - (a.price ?? 0)),
    });
  }

  if (noSuburb.length > 0) {
    unlocated.push({
      key: null,
      suburb: "(no suburb recorded)",
      state: null,
      count: noSuburb.length,
      reason: "no-suburb",
    });
  }

  clusters.sort((a, b) => b.count - a.count);
  unlocated.sort((a, b) => b.count - a.count);
  return { clusters, unlocated };
}

/** Distinct suburb keys present in a row set, in first-seen order. */
export function distinctKeys(rows: StockRow[]): SuburbKey[] {
  const seen = new Set<SuburbKey>();
  const out: SuburbKey[] = [];
  for (const row of rows) {
    const key = suburbKey(row.suburb, row.state);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}
