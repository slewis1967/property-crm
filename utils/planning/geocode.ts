/**
 * Address → point + state, via OpenStreetMap Nominatim (keyless, AU-scoped).
 *
 * This is the same geocoder the feasibility route already used, extended to
 * also return the state (from Nominatim's structured address, falling back to a
 * state token in the raw address string). The state selects which adapter runs.
 */

import type { LngLat, StateCode } from "./types";

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

export type GeocodeResult = { point: LngLat; state: StateCode | null; display?: string };

function inferStateFromText(address: string): StateCode | null {
  const s = address.toUpperCase();
  for (const code of STATE_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(s)) return code;
  }
  return null;
}

export async function geocodeAU(address: string, timeoutMs = 7000): Promise<GeocodeResult | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}` +
      `&format=json&limit=1&countrycodes=au&addressdetails=1`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NextKey-CRM-PlanningFeasibility/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: { state?: string };
    }>;
    const hit = arr?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    const stateName = (hit.address?.state ?? "").toLowerCase();
    const state = STATE_NAMES[stateName] ?? inferStateFromText(address);
    return { point: { lat, lng }, state, display: hit.display_name };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
