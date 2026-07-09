/**
 * Pure geometry for the 3D building-envelope massing (Phase 3).
 *
 * Pipeline: real parcel polygon (lng/lat) → project to local metres → convex
 * hull → minimum-area oriented rectangle → inset by front/rear/side setbacks →
 * an extrudable building footprint. Working from the lot's own oriented
 * rectangle (rather than a rounded polygon buffer) keeps the footprint always
 * valid and axis-aligned to the street, which is how quick massing is shown and
 * avoids the self-intersection failure modes of a naive negative buffer.
 *
 * All functions are pure and framework-free so they can be unit-tested and run
 * client-side in the viewer.
 */

import type { GeoPolygon } from "../planning/types";
import type { DensityClass } from "../feasibility/types";
import { defaultSetbacks, type Setbacks } from "./setbacks";

export type Pt = [number, number]; // local metres: x east, y north

export type OrientedRect = {
  center: Pt;
  width: number; // extent along the u (edge) axis
  depth: number; // extent along the v (perpendicular) axis
  ux: number; // u-axis unit vector
  uy: number;
  corners: Pt[]; // 4 corners in local metres
};

export type MassingModel = {
  /** Parcel boundary ring, local metres (open ring, exterior only). */
  parcel: Pt[];
  /** Building footprint (inset oriented rectangle), local metres, 4 corners. */
  footprint: Pt[];
  heightM: number;
  storeys: number;
  storeyHeightM: number;
  footprintAreaSqm: number;
  siteAreaSqm: number | null;
  setbacks: Setbacks;
  /** True if the setbacks left no room and the footprint was clamped to a nominal central area. */
  clamped: boolean;
  /** Geocentre of the parcel (for reference / satellite alignment). */
  center: { lng: number; lat: number };
};

const M_PER_DEG_LAT = 110574;

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

/** Andrew's monotone-chain convex hull. Returns CCW hull (open). */
export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Shoelace area (absolute) of a ring in local metres. */
export function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Ray-casting point-in-ring test. `ring` is [x,y] pairs (any planar coords). */
export function pointInRing(pt: Pt, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Even-odd point test across an Esri polygon's rings (handles holes). */
export function pointInRings(pt: Pt, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) if (pointInRing(pt, ring)) inside = !inside;
  return inside;
}

/** Shoelace centroid of a single ring (any planar coords). */
export function ringCentroid(ring: number[][]): Pt {
  let a = 0,
    cx = 0,
    cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (6 * a), cy / (6 * a)];
}

/** Centroid of the largest ring of an Esri polygon (a representative interior point). */
export function largestRingCentroid(rings: number[][][]): Pt | null {
  if (!rings?.length) return null;
  let best = rings[0];
  let bestA = -1;
  for (const r of rings) {
    let a = 0;
    for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    const abs = Math.abs(a);
    if (abs > bestA) {
      bestA = abs;
      best = r;
    }
  }
  return ringCentroid(best);
}

/** Minimum-area enclosing rectangle via rotating calipers over hull edges. */
export function minAreaRect(points: Pt[]): OrientedRect | null {
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    const ux = ex / len;
    const uy = ey / len; // u-axis; v-axis is (-uy, ux)
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const p of hull) {
      const u = p[0] * ux + p[1] * uy;
      const v = -p[0] * uy + p[1] * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    const w = maxU - minU;
    const d = maxV - minV;
    const area = w * d;
    if (area < bestArea) {
      bestArea = area;
      const toWorld = (u: number, v: number): Pt => [u * ux - v * uy, u * uy + v * ux];
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      best = {
        center: toWorld(cu, cv),
        width: w,
        depth: d,
        ux,
        uy,
        corners: [
          toWorld(minU, minV),
          toWorld(maxU, minV),
          toWorld(maxU, maxV),
          toWorld(minU, maxV),
        ],
      };
    }
  }
  return best;
}

/**
 * Inset an oriented rectangle by setbacks and return the 4 footprint corners in
 * local metres. Side setbacks apply to the shorter (frontage) axis' long edges;
 * front/rear to the longer (depth) axis' ends. Falls back to a central 40%
 * footprint (clamped=true) when the setbacks would leave no room.
 */
export function insetRect(
  rect: OrientedRect,
  setbacks: Setbacks,
): { corners: Pt[]; areaSqm: number; clamped: boolean } {
  const { ux, uy, width, depth } = rect;
  const toWorld = (u: number, v: number): Pt => {
    // u,v measured from the rect's min corner along its axes
    const u0 = rect.center[0] - (width / 2) * ux - (depth / 2) * -uy;
    const u0y = rect.center[1] - (width / 2) * uy - (depth / 2) * ux;
    return [u0 + u * ux - v * uy, u0y + u * uy + v * ux];
  };
  // Decide which axis is frontage (shorter side).
  const frontageAlongU = width <= depth;
  let uLo: number, uHi: number, vLo: number, vHi: number;
  if (frontageAlongU) {
    uLo = setbacks.side;
    uHi = width - setbacks.side;
    vLo = setbacks.front;
    vHi = depth - setbacks.rear;
  } else {
    uLo = setbacks.front;
    uHi = width - setbacks.rear;
    vLo = setbacks.side;
    vHi = depth - setbacks.side;
  }
  let clamped = false;
  if (uHi - uLo < 1 || vHi - vLo < 1) {
    clamped = true;
    uLo = width * 0.3;
    uHi = width * 0.7;
    vLo = depth * 0.3;
    vHi = depth * 0.7;
  }
  const corners: Pt[] = [
    toWorld(uLo, vLo),
    toWorld(uHi, vLo),
    toWorld(uHi, vHi),
    toWorld(uLo, vHi),
  ];
  return { corners, areaSqm: Math.max(0, (uHi - uLo) * (vHi - vLo)), clamped };
}

/** Project a GeoJSON polygon's exterior ring to local metres about its centroid. */
export function projectRing(geo: GeoPolygon): { ring: Pt[]; center: { lng: number; lat: number } } {
  const ext =
    geo.type === "Polygon"
      ? (geo.coordinates as number[][][])[0]
      : // MultiPolygon: use the ring with the most vertices (largest part).
        (geo.coordinates as number[][][][])
          .map((poly) => poly[0])
          .reduce((a, b) => (b.length > a.length ? b : a), [] as number[][]);
  if (!ext || ext.length < 3) return { ring: [], center: { lng: 0, lat: 0 } };
  const oLng = ext.reduce((s, p) => s + p[0], 0) / ext.length;
  const oLat = ext.reduce((s, p) => s + p[1], 0) / ext.length;
  const mPerLng = 111320 * Math.cos((oLat * Math.PI) / 180);
  const ring: Pt[] = ext.map(([lng, lat]) => [(lng - oLng) * mPerLng, (lat - oLat) * M_PER_DEG_LAT]);
  return { ring, center: { lng: oLng, lat: oLat } };
}

/** Build the full massing model from a parcel polygon + envelope parameters. */
export function buildMassing(opts: {
  geometry: GeoPolygon;
  storeys: number;
  heightM?: number | null;
  density: DensityClass;
  siteAreaSqm?: number | null;
  storeyHeightM?: number;
  setbacks?: Partial<Setbacks>;
}): MassingModel | null {
  const { geometry, storeys, density } = opts;
  const storeyHeightM = opts.storeyHeightM ?? 3.1;
  const setbacks = defaultSetbacks(density, opts.setbacks);
  const { ring, center } = projectRing(geometry);
  if (ring.length < 3) return null;
  const rect = minAreaRect(ring);
  if (!rect) return null;
  const { corners, areaSqm, clamped } = insetRect(rect, setbacks);
  const heightM = opts.heightM ?? storeys * storeyHeightM;
  return {
    parcel: ring,
    footprint: corners,
    heightM,
    storeys,
    storeyHeightM,
    footprintAreaSqm: Math.round(areaSqm),
    siteAreaSqm: opts.siteAreaSqm ?? Math.round(ringArea(ring)),
    setbacks,
    clamped,
    center,
  };
}
