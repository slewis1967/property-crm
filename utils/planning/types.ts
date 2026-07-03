/**
 * Shared types for the planning-data layer.
 *
 * A `StateAdapter` turns a geocoded point into authoritative site facts pulled
 * from that state's government spatial services (cadastre + planning scheme).
 * The feasibility tool consumes the normalised `SiteData` so the AI grounds its
 * report on verified figures instead of guessing from a satellite image.
 *
 * Everything here is best-effort: an adapter NEVER throws — it returns whatever
 * it could resolve and the caller degrades gracefully (down to AI-only research).
 */

export type StateCode = "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT" | "NT";

export type LngLat = { lng: number; lat: number };

/** GeoJSON polygon geometry (EPSG:4326). Used for the map + future 3D envelope. */
export type GeoPolygon = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type Parcel = {
  lot?: string | null;
  plan?: string | null;
  /** Combined legal reference, e.g. "12/DP1234567" (NSW) or "3/RP12345" (QLD). */
  lotPlan?: string | null;
  /** Site area in m². Authoritative when `areaEstimated` is false. */
  areaSqm?: number | null;
  areaEstimated?: boolean;
  /** Local government area / council / local authority. */
  lga?: string | null;
  locality?: string | null;
  /** Parcel boundary as GeoJSON (EPSG:4326), when available. */
  geometry?: GeoPolygon | null;
};

export type PlanningControls = {
  zoneCode?: string | null; // e.g. "R2", "GRZ", "LDR"
  zoneDescription?: string | null; // e.g. "Low Density Residential"
  heightLimitM?: number | null; // maximum building height (metres)
  fsr?: number | null; // floor space ratio, e.g. 0.5
  minLotSizeSqm?: number | null; // minimum lot size for subdivision (m²)
  landUse?: string | null;
  /** Governing instrument, e.g. the NSW LEP name or the VIC planning scheme. */
  instrument?: string | null;
};

export type Overlay = {
  kind: "flood" | "bushfire" | "heritage" | "easement" | "other";
  label: string;
  detail?: string | null;
};

export type SiteSource = { name: string; url: string };

/** How much authoritative spatial data we managed to resolve. */
export type Coverage = "full" | "partial" | "none";

export type SiteData = {
  address: string;
  state: StateCode | null;
  location: LngLat | null;
  parcel: Parcel | null;
  controls: PlanningControls | null;
  overlays: Overlay[];
  sources: SiteSource[];
  coverage: Coverage;
  /** Caveats, e.g. "QLD zoning is per-council and not resolved statewide". */
  notes: string[];
};

export interface StateAdapter {
  code: StateCode;
  name: string;
  /**
   * Resolve everything available for a point. Best-effort; must NEVER throw.
   * Returns a partial SiteData (parcel / controls / overlays / sources / notes).
   */
  gather(point: LngLat, address: string): Promise<Partial<SiteData>>;
}
