import { describe, it, expect } from "vitest";
import { generateMassingOptions } from "./sweep";
import type { GeoPolygon, PlanningControls } from "../planning/types";

// ~40 m square parcel near Sydney (~1600 m²).
const oLat = -33.8;
const mPerLat = 110574;
const mPerLng = 111320 * Math.cos((oLat * Math.PI) / 180);
const half = 20;
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

describe("generateMassingOptions", () => {
  it("produces multiple ranked options for a medium-density FSR site, top = highest yield", () => {
    const controls: PlanningControls = {
      zoneCode: "R3",
      zoneDescription: "Medium Density Residential",
      heightLimitM: 12,
      fsr: 0.9,
      minLotSizeSqm: null,
    };
    const opts = generateMassingOptions({
      geometry: square,
      controls,
      density: "medium",
      siteAreaSqm: 1600,
      objective: "yield",
    });
    expect(opts.length).toBeGreaterThan(1);
    // ranked descending by score → dwellings non-increasing
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i - 1].score).toBeGreaterThanOrEqual(opts[i].score);
    }
    // every option has a valid massing + positive GFA + financials
    for (const o of opts) {
      expect(o.massing.footprint.length).toBe(4);
      expect(o.gfaSqm).toBeGreaterThan(0);
      expect(o.financials.grossRealisation).toBeGreaterThan(0);
      expect(["townhouses", "apartments"]).toContain(o.typology);
    }
    // FSR should bind at least one high-storey option (0.9 × 1600 = 1440 cap)
    expect(opts.some((o) => o.bindingConstraint === "FSR")).toBe(true);
  });

  it("caps low-density options to house/duplex (no townhouses)", () => {
    const controls: PlanningControls = {
      zoneCode: "R2",
      zoneDescription: "Low Density Residential",
      heightLimitM: 9,
      fsr: null,
      minLotSizeSqm: 450,
    };
    const opts = generateMassingOptions({
      geometry: square,
      controls,
      density: "low",
      siteAreaSqm: 1600,
    });
    expect(opts.length).toBeGreaterThan(0);
    for (const o of opts) {
      expect(["house", "duplex"]).toContain(o.typology);
      expect(o.dwellings).toBeLessThanOrEqual(2);
    }
  });
});
