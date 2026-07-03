/**
 * Minimal ArcGIS REST helpers for the state adapters.
 *
 * All Australian state cadastre/planning data is published as ArcGIS REST
 * MapServer/FeatureServer layers. We only need one operation: "what feature is
 * at this point?" (a point-intersect query). Everything here is defensive —
 * network errors, ArcGIS error envelopes and empty results all resolve to null
 * rather than throwing, so an adapter can compose several lookups without
 * try/catch at every call site.
 */

import type { GeoPolygon, LngLat } from "./types";

const DEFAULT_TIMEOUT = 8000;

async function fetchJson(url: string, ms = DEFAULT_TIMEOUT): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    // ArcGIS returns HTTP 200 with an `error` envelope on bad params — treat as null.
    if (data && typeof data === "object" && "error" in data) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type ArcgisFeature = {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] } | null;
};

/**
 * Query an ArcGIS REST feature layer for the first feature intersecting `point`.
 * `base` is the MapServer/FeatureServer URL (without the layer id).
 */
export async function queryPoint(
  base: string,
  layerId: number,
  point: LngLat,
  opts: { returnGeometry?: boolean; outFields?: string; timeout?: number } = {},
): Promise<ArcgisFeature | null> {
  const { returnGeometry = false, outFields = "*", timeout } = opts;
  const geometry = encodeURIComponent(`${point.lng},${point.lat}`);
  const url =
    `${base}/${layerId}/query?f=json&geometry=${geometry}` +
    `&geometryType=esriGeometryPoint&inSR=4326&outSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&outFields=${encodeURIComponent(outFields)}` +
    `&returnGeometry=${returnGeometry}&resultRecordCount=1`;
  const data = await fetchJson(url, timeout);
  const features = data?.features as ArcgisFeature[] | undefined;
  const feat = features?.[0];
  if (!feat) return null;
  return { attributes: feat.attributes ?? {}, geometry: feat.geometry ?? null };
}

export type Bbox = [xmin: number, ymin: number, xmax: number, ymax: number];

/**
 * Query all features of an ArcGIS layer intersecting a lng/lat envelope (bulk).
 * Used by the region-prospecting scan. Returns [] on any error. ArcGIS caps the
 * result at the layer's maxRecordCount; pass an `orderBy` (e.g. "planlotarea
 * DESC") so the most relevant rows come first when the cap truncates.
 */
export async function queryEnvelope(
  base: string,
  layerId: number,
  bbox: Bbox,
  opts: {
    where?: string;
    outFields?: string;
    returnGeometry?: boolean;
    orderBy?: string;
    resultRecordCount?: number;
    timeout?: number;
  } = {},
): Promise<{ features: ArcgisFeature[]; exceeded: boolean }> {
  const {
    where = "1=1",
    outFields = "*",
    returnGeometry = true,
    orderBy,
    resultRecordCount = 1000,
    timeout = 20000,
  } = opts;
  const geometry = encodeURIComponent(`${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`);
  let url =
    `${base}/${layerId}/query?f=json&geometry=${geometry}` +
    `&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326` +
    `&spatialRel=esriSpatialRelIntersects&where=${encodeURIComponent(where)}` +
    `&outFields=${encodeURIComponent(outFields)}&returnGeometry=${returnGeometry}` +
    `&resultRecordCount=${resultRecordCount}`;
  if (orderBy) url += `&orderByFields=${encodeURIComponent(orderBy)}`;
  const data = await fetchJson(url, timeout);
  const raw = (data?.features as ArcgisFeature[] | undefined) ?? [];
  const features = raw.map((f) => ({ attributes: f.attributes ?? {}, geometry: f.geometry ?? null }));
  return { features, exceeded: Boolean(data?.exceededTransferLimit) };
}

/** Convert an Esri polygon geometry (rings) to a GeoJSON Polygon/MultiPolygon. */
export function esriToGeoJSON(geometry: { rings?: number[][][] } | null | undefined): GeoPolygon | null {
  const rings = geometry?.rings;
  if (!Array.isArray(rings) || rings.length === 0) return null;
  // Parcels are almost always a single ring. When there are several disjoint
  // rings we emit a MultiPolygon (each ring as its own part) — good enough for
  // display and area; a full hole-vs-part classification isn't needed here.
  if (rings.length === 1) return { type: "Polygon", coordinates: [rings[0]] };
  return { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };
}

/**
 * Approximate polygon area in m² for a GeoJSON polygon in EPSG:4326, using a
 * local equirectangular projection at the polygon's mean latitude. Accurate to
 * well within a percent at parcel scale — used only when the source layer does
 * not carry an authoritative area (e.g. VIC parcels).
 */
export function approxAreaSqm(geo: GeoPolygon | null): number | null {
  if (!geo) return null;
  const polys =
    geo.type === "Polygon"
      ? [geo.coordinates as number[][][]]
      : (geo.coordinates as number[][][][]);
  let total = 0;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 4) continue;
    const latMean = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    const mPerDegLat = 110574;
    const mPerDegLng = 111320 * Math.cos((latMean * Math.PI) / 180);
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const x1 = ring[i][0] * mPerDegLng;
      const y1 = ring[i][1] * mPerDegLat;
      const x2 = ring[i + 1][0] * mPerDegLng;
      const y2 = ring[i + 1][1] * mPerDegLat;
      area += x1 * y2 - x2 * y1;
    }
    total += Math.abs(area) / 2;
  }
  return total > 0 ? Math.round(total) : null;
}

/** Pull the first parseable number out of a set of candidate values. */
export function firstNumber(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === "number" && isFinite(v)) return v;
    const m = String(v).match(/[\d]+(?:\.[\d]+)?/);
    if (m) {
      const n = parseFloat(m[0]);
      if (isFinite(n)) return n;
    }
  }
  return null;
}
