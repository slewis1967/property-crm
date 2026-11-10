/**
 * Basemap definitions for the Stock Map.
 *
 * Kept out of StockMapCanvas.tsx (which imports Leaflet) so the client shell
 * can render the layer switcher without dragging Leaflet into the server
 * bundle — the same rule that put the price bands in bands.ts. See that file
 * for what goes wrong otherwise.
 *
 * Every source here is KEYLESS and delivered as raster tiles, which matters
 * twice over:
 *  - No API key means no billing account and no secret to rotate.
 *  - Raster tiles are plain <img> requests, which the app's CSP allows via
 *    `img-src https:`. A vector basemap (MapLibre, Mapbox GL) fetches its
 *    style and tiles with fetch()/XHR, and `connect-src` is restricted to self
 *    + Supabase — those requests would be blocked with no visible error.
 * Esri World Imagery is already used keylessly elsewhere in the app (the
 * planning-feasibility route pulls a satellite tile from it).
 */

export type BasemapId = "streets" | "satellite" | "hybrid";

export type BasemapDef = {
  id: BasemapId;
  label: string;
  /** XYZ template. Note Esri uses {z}/{y}/{x} — row before column. */
  url: string;
  attribution: string;
  /** Highest zoom Leaflet will render, upscaling past maxNativeZoom. */
  maxZoom: number;
  /** Highest zoom the server actually has tiles for. */
  maxNativeZoom: number;
  /**
   * Optional transparent overlay drawn on top — place names and boundaries for
   * the hybrid view, since raw imagery has no labels at all and an advisor
   * can't tell one growth-corridor estate from the next without them.
   */
  labelsUrl?: string;
};

export const BASEMAPS: Record<BasemapId, BasemapDef> = {
  streets: {
    id: "streets",
    label: "Streets",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
    maxNativeZoom: 19,
  },
  satellite: {
    id: "satellite",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    // Esri publishes z20+ over AU metro but not everywhere; cap native at 19
    // and let Leaflet upscale rather than show empty tiles over regional stock.
    maxZoom: 21,
    maxNativeZoom: 19,
  },
  hybrid: {
    id: "hybrid",
    label: "Satellite + labels",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 21,
    maxNativeZoom: 19,
    labelsUrl:
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
};

export const BASEMAP_ORDER: BasemapId[] = ["streets", "satellite", "hybrid"];

export const DEFAULT_BASEMAP: BasemapId = "streets";

/** Narrow an arbitrary stored value (localStorage) back to a valid id. */
export function coerceBasemap(value: string | null | undefined): BasemapId {
  return value === "satellite" || value === "hybrid" || value === "streets"
    ? value
    : DEFAULT_BASEMAP;
}

/**
 * Google Street View at a point, opened in a new tab.
 *
 * A link, deliberately, not an embed. An embedded panorama needs the Maps
 * JavaScript API — which means a billable Google Maps key AND two CSP
 * relaxations (`script-src` for maps.googleapis.com, `connect-src` for its
 * tile/metadata calls). This URL form costs nothing and needs no key.
 *
 * Google shows its "no imagery here" screen if the point has no coverage,
 * which is the honest outcome for a rural suburb centroid.
 */
export function streetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
}

/**
 * Google Maps for a street address (place view, with Street View one click
 * away via the pegman).
 *
 * Used instead of streetViewUrl when a property actually records an address:
 * we hold no coordinates for it, and dropping the user at the suburb centroid
 * would show them a road that has nothing to do with the property.
 */
export function addressMapsUrl(address: string, suburb?: string | null, state?: string | null): string {
  const q = [address, suburb, state, "Australia"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/* -------------------------------------------------------------------------
 * Basemap preference store
 *
 * The chosen view is per-viewer, so it belongs in localStorage — but reading
 * localStorage during render is a hydration bug: the server has no idea what
 * the browser stored, renders "streets", and React reports
 *
 *   "A tree hydrated but some attributes of the server rendered HTML didn't
 *    match the client properties. This won't be patched up."
 *
 * "Won't be patched up" is the sharp edge — the map obeyed the stored value
 * while the toggle buttons kept the server's, so the UI said Streets while
 * showing satellite, permanently.
 *
 * useSyncExternalStore is the sanctioned fix: React hydrates with the server
 * snapshot (the default), then re-renders with the real client value.
 * ---------------------------------------------------------------------- */

const STORAGE_KEY = "properties.map.basemap";

let cached: BasemapId | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeBasemap(onChange: () => void): () => void {
  listeners.add(onChange);
  // Keep two open tabs in step; harmless if `storage` never fires.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cached = coerceBasemap(e.newValue);
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Must return a referentially stable value or React re-renders forever —
 * hence the module-level cache rather than reading storage on every call.
 * BasemapId is a string, so equality is by value anyway, but the cache also
 * keeps this off the hot path.
 */
export function getBasemapSnapshot(): BasemapId {
  if (cached === null) {
    try {
      cached = coerceBasemap(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Private mode, or site data blocked — the default is perfectly usable.
      cached = DEFAULT_BASEMAP;
    }
  }
  return cached;
}

/** What the server renders, and what React hydrates against. */
export function getBasemapServerSnapshot(): BasemapId {
  return DEFAULT_BASEMAP;
}

export function setStoredBasemap(id: BasemapId): void {
  if (cached === id) return;
  cached = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Not being able to remember the choice must never block changing it.
  }
  emit();
}
