/**
 * The partner Stock Map: masked lots rolled up to one bubble per suburb. Pure.
 *
 * Built from PartnerLot (already masked by loadPartnerStock), never from
 * global_stock_pool rows, so builder, estate, street address and lot number
 * cannot reach the partner's browser. The suburb is the finest location shown:
 * a bubble sits on the suburb centroid from the stock_geocodes cache, which is
 * public information and the same place the Stock and Suburbs pages already name.
 */
import type { LotAvailability, PartnerLot } from "./partner";
import { median } from "./geo/clusters";
import { suburbKey, type SuburbKey, type SuburbPoint } from "./geo/suburbs";

export type PartnerMapLot = {
  id: string;
  ref: string;
  type: string | null;
  beds: number | null;
  baths: number | null;
  cars: number | null;
  landSqm: number | null;
  price: number | null;
  availability: LotAvailability;
};

export type PartnerMapCluster = {
  key: SuburbKey;
  suburb: string;
  state: string | null;
  lat: number;
  lng: number;
  count: number;
  available: number;
  minPrice: number | null;
  maxPrice: number | null;
  medianPrice: number | null;
  types: string[];
  lots: PartnerMapLot[];
};

function toMapLot(lot: PartnerLot): PartnerMapLot {
  return {
    id: lot.id,
    ref: lot.ref,
    type: lot.propertyType,
    beds: lot.bedrooms,
    baths: lot.bathrooms,
    cars: lot.carSpaces,
    landSqm: lot.landSizeSqm,
    price: lot.price,
    availability: lot.availability,
  };
}

/** Distinct geocode-cache keys for a set of lots. */
export function lotSuburbKeys(lots: readonly PartnerLot[]): SuburbKey[] {
  const keys = new Set<SuburbKey>();
  for (const lot of lots) {
    const key = suburbKey(lot.suburb, lot.state);
    if (key) keys.add(key);
  }
  return [...keys];
}

const AVAILABILITY_ORDER: Record<LotAvailability, number> = { available: 0, on_hold: 1, unavailable: 2 };

/**
 * One cluster per placed suburb, busiest first. Lots whose suburb has no cached
 * centroid are counted in `unplaced`, so the page can say so instead of quietly
 * dropping them.
 */
export function partnerMapClusters(
  lots: readonly PartnerLot[],
  points: ReadonlyMap<SuburbKey, SuburbPoint>,
): { clusters: PartnerMapCluster[]; unplaced: number } {
  const grouped = new Map<SuburbKey, PartnerLot[]>();
  let unplaced = 0;
  for (const lot of lots) {
    const key = suburbKey(lot.suburb, lot.state);
    if (!key || !points.has(key)) {
      unplaced += 1;
      continue;
    }
    const bucket = grouped.get(key);
    if (bucket) bucket.push(lot);
    else grouped.set(key, [lot]);
  }

  const clusters: PartnerMapCluster[] = [];
  for (const [key, bucket] of grouped) {
    const point = points.get(key)!;
    const prices = bucket.map((l) => l.price).filter((p): p is number => p !== null);
    const sample = bucket.find((l) => l.suburb?.trim());
    clusters.push({
      key,
      suburb: sample?.suburb?.trim() || point.suburb,
      state: sample?.state?.trim().toUpperCase() || point.state,
      lat: point.lat,
      lng: point.lng,
      count: bucket.length,
      available: bucket.filter((l) => l.availability === "available").length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      medianPrice: median(prices),
      types: [...new Set(bucket.map((l) => l.propertyType?.trim()).filter((t): t is string => !!t))].sort(),
      lots: bucket
        .map(toMapLot)
        .sort(
          (a, b) =>
            AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] ||
            (a.price ?? Infinity) - (b.price ?? Infinity),
        ),
    });
  }
  clusters.sort((a, b) => b.count - a.count || a.suburb.localeCompare(b.suburb));
  return { clusters, unplaced };
}
