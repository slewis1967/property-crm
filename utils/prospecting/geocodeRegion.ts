/**
 * Region → bounding box, via OpenStreetMap Nominatim.
 *
 * Unlike the address geocoder this returns the region's bounding box. Very large
 * regions are clamped to a ~MAX_SPAN_DEG window around the centre so a scan
 * can't try to pull the entire state's cadastre; the caller surfaces that.
 */

import type { StateCode } from "../planning/types";
import type { Bbox } from "../planning/arcgis";

const MAX_SPAN_DEG = 0.25; // ~27 km — keeps a scan tractable

const STATE_NAMES: Record<string, StateCode> = {
  "new south wales": "NSW",
  victoria: "VIC",
  queensland: "QLD",
  "south australia": "SA",
  "western australia": "WA",
  tasmania: "TAS",
  "australian capital territory": "ACT",
  "northern territory": "NT",
};

const STATE_CODES: StateCode[] = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

function inferState(region: string): StateCode | null {
  const s = region.toUpperCase();
  for (const c of STATE_CODES) if (new RegExp(`\\b${c}\\b`).test(s)) return c;
  return null;
}

export type RegionGeo = {
  center: { lng: number; lat: number };
  bbox: Bbox;
  state: StateCode | null;
  display: string;
  clamped: boolean;
};

export async function geocodeRegion(region: string, timeoutMs = 8000): Promise<RegionGeo | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(region)}` +
      `&format=json&limit=1&countrycodes=au&addressdetails=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NextKey-CRM-Prospecting/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      boundingbox?: [string, string, string, string]; // [south, north, west, east]
      address?: { state?: string };
    }>;
    const hit = arr?.[0];
    if (!hit?.lat || !hit?.lon || !hit.boundingbox) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    const [s, n, w, e] = hit.boundingbox.map(parseFloat);
    if (![lat, lng, s, n, w, e].every(isFinite)) return null;

    let [xmin, ymin, xmax, ymax] = [w, s, e, n] as Bbox;
    let clamped = false;
    if (xmax - xmin > MAX_SPAN_DEG || ymax - ymin > MAX_SPAN_DEG) {
      clamped = true;
      const half = MAX_SPAN_DEG / 2;
      xmin = lng - half;
      xmax = lng + half;
      ymin = lat - half;
      ymax = lat + half;
    }
    const state = STATE_NAMES[(hit.address?.state ?? "").toLowerCase()] ?? inferState(region);
    return { center: { lng, lat }, bbox: [xmin, ymin, xmax, ymax], state, display: hit.display_name ?? region, clamped };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
