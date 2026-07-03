import { describe, it, expect } from "vitest";
import {
  convexHull,
  ringArea,
  minAreaRect,
  insetRect,
  buildMassing,
  pointInRings,
  largestRingCentroid,
  type Pt,
} from "./geometry";
import type { GeoPolygon } from "../planning/types";

describe("convexHull", () => {
  it("returns the 4 corners of a square (ignoring interior points)", () => {
    const pts: Pt[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [5, 5], // interior — should be dropped
    ];
    const hull = convexHull(pts);
    expect(hull.length).toBe(4);
  });
});

describe("ringArea", () => {
  it("computes the area of a 10×10 square", () => {
    expect(ringArea([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])).toBeCloseTo(100, 6);
  });
});

describe("minAreaRect", () => {
  it("recovers the dimensions of an axis-aligned rectangle", () => {
    const rect = minAreaRect([
      [0, 0],
      [30, 0],
      [30, 20],
      [0, 20],
    ]);
    expect(rect).not.toBeNull();
    const dims = [rect!.width, rect!.depth].sort((a, b) => a - b);
    expect(dims[0]).toBeCloseTo(20, 4);
    expect(dims[1]).toBeCloseTo(30, 4);
  });

  it("recovers the dimensions of a 45°-rotated rectangle", () => {
    const a = 40,
      b = 20;
    const c = Math.SQRT1_2;
    // rectangle rotated 45°, centred at origin
    const corners: Pt[] = [
      [(-a / 2) * c - (-b / 2) * c, (-a / 2) * c + (-b / 2) * c],
      [(a / 2) * c - (-b / 2) * c, (a / 2) * c + (-b / 2) * c],
      [(a / 2) * c - (b / 2) * c, (a / 2) * c + (b / 2) * c],
      [(-a / 2) * c - (b / 2) * c, (-a / 2) * c + (b / 2) * c],
    ];
    const rect = minAreaRect(corners);
    expect(rect).not.toBeNull();
    const dims = [rect!.width, rect!.depth].sort((x, y) => x - y);
    expect(dims[0]).toBeCloseTo(20, 3);
    expect(dims[1]).toBeCloseTo(40, 3);
  });
});

describe("insetRect", () => {
  it("insets a 30×20 rectangle by setbacks and preserves area math", () => {
    const rect = minAreaRect([
      [0, 0],
      [30, 0],
      [30, 20],
      [0, 20],
    ])!;
    // width=30 (u), depth=20... but minAreaRect may pick either orientation.
    const { areaSqm, clamped } = insetRect(rect, { front: 4, rear: 4, side: 3 });
    expect(clamped).toBe(false);
    // frontage = shorter side (20): side 3 both → 14; front/rear 4 → 22 on the 30 side.
    expect(areaSqm).toBeCloseTo(14 * 22, 3);
  });

  it("clamps when setbacks exceed the lot", () => {
    const rect = minAreaRect([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])!;
    const { clamped } = insetRect(rect, { front: 6, rear: 6, side: 6 });
    expect(clamped).toBe(true);
  });
});

describe("pointInRings / largestRingCentroid", () => {
  const square: number[][][] = [[
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]];
  it("detects inside vs outside", () => {
    expect(pointInRings([5, 5], square)).toBe(true);
    expect(pointInRings([15, 5], square)).toBe(false);
  });
  it("respects holes (even-odd)", () => {
    const withHole: number[][][] = [
      square[0],
      [
        [4, 4],
        [6, 4],
        [6, 6],
        [4, 6],
        [4, 4],
      ],
    ];
    expect(pointInRings([5, 5], withHole)).toBe(false); // in the hole
    expect(pointInRings([1, 1], withHole)).toBe(true);
  });
  it("centroid of a square is its centre", () => {
    const c = largestRingCentroid(square)!;
    expect(c[0]).toBeCloseTo(5, 6);
    expect(c[1]).toBeCloseTo(5, 6);
  });
});

describe("buildMassing", () => {
  // ~40m square parcel near Sydney.
  const oLat = -33.8;
  const mPerLat = 110574;
  const mPerLng = 111320 * Math.cos((oLat * Math.PI) / 180);
  const half = 20; // metres → half-side
  const dLat = half / mPerLat;
  const dLng = half / mPerLng;
  const square: GeoPolygon = {
    type: "Polygon",
    coordinates: [[
      [151 - dLng, oLat - dLat],
      [151 + dLng, oLat - dLat],
      [151 + dLng, oLat + dLat],
      [151 - dLng, oLat + dLat],
      [151 - dLng, oLat - dLat],
    ]],
  };

  it("produces a valid low-density massing on a 40×40 lot", () => {
    const m = buildMassing({ geometry: square, storeys: 2, density: "low" });
    expect(m).not.toBeNull();
    expect(m!.clamped).toBe(false);
    expect(m!.footprint.length).toBe(4);
    expect(m!.heightM).toBeCloseTo(2 * 3.1, 5);
    // site area ≈ 40×40 = 1600 m² (within projection tolerance)
    expect(m!.siteAreaSqm!).toBeGreaterThan(1500);
    expect(m!.siteAreaSqm!).toBeLessThan(1700);
    // footprint smaller than the site
    expect(m!.footprintAreaSqm).toBeLessThan(m!.siteAreaSqm!);
    expect(m!.footprintAreaSqm).toBeGreaterThan(0);
  });

  it("uses the height limit when supplied", () => {
    const m = buildMassing({ geometry: square, storeys: 3, heightM: 8.5, density: "low" });
    expect(m!.heightM).toBeCloseTo(8.5, 5);
  });
});
