import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bandFor, radiusFor, PRICE_LEGEND } from "./bands";
import {
  BASEMAPS,
  BASEMAP_ORDER,
  DEFAULT_BASEMAP,
  coerceBasemap,
  streetViewUrl,
  addressMapsUrl,
} from "./basemaps";

describe("bandFor", () => {
  it("uses absolute bands, so filtering never recolours a suburb", () => {
    expect(bandFor(550_000).label).toBe("under $600k");
    expect(bandFor(700_000).label).toBe("$600k–750k");
    expect(bandFor(800_000).label).toBe("$750k–900k");
    expect(bandFor(1_200_000).label).toBe("$900k+");
  });

  it("is half-open at each boundary — the max belongs to the next band up", () => {
    expect(bandFor(599_999).label).toBe("under $600k");
    expect(bandFor(600_000).label).toBe("$600k–750k");
    expect(bandFor(900_000).label).toBe("$900k+");
  });

  it("gives priceless suburbs their own colour rather than a misleading band", () => {
    expect(bandFor(null).label).toBe("no price");
    expect(bandFor(null).color).not.toBe(bandFor(550_000).color);
  });

  it("legend covers every band plus the no-price case, with unique colours", () => {
    expect(PRICE_LEGEND).toHaveLength(5);
    expect(new Set(PRICE_LEGEND.map((b) => b.color)).size).toBe(5);
  });
});

describe("radiusFor", () => {
  it("scales area, not radius, with the property count", () => {
    // 4x the properties should be exactly 2x the radius above the baseline
    // offset, because area (pi*r^2) is what the eye reads as "how much stock".
    // Counts chosen to sit BELOW the 34px clamp — at 100 the clamp binds and
    // the ratio is deliberately no longer sqrt (see the clamp test below).
    const r1 = radiusFor(9) - 5;
    const r2 = radiusFor(36) - 5;
    expect(r2 / r1).toBeCloseTo(2, 5);
  });

  it("clamps both ends so one property stays clickable and a big suburb doesn't swallow its neighbours", () => {
    expect(radiusFor(1)).toBeGreaterThanOrEqual(7);
    expect(radiusFor(0)).toBeGreaterThanOrEqual(7);
    expect(radiusFor(100_000)).toBeLessThanOrEqual(34);
  });

  it("is monotonic — more stock never draws a smaller bubble", () => {
    const counts = [1, 5, 20, 50, 121, 500];
    const radii = counts.map(radiusFor);
    expect(radii).toEqual([...radii].sort((a, b) => a - b));
  });
});

describe("StockMapClient / StockMapCanvas module boundary", () => {
  /**
   * Regression guard for a real bug: StockMapClient imported PRICE_LEGEND
   * straight from StockMapCanvas. That is a *static* import, so it pulled
   * Leaflet into the server bundle regardless of the next/dynamic({ssr:false})
   * wrapper, and every render of /properties/map threw "window is not defined"
   * during SSR. The page still answered 200 (the shell rendered) so no route
   * test caught it — only reading the dev server log did.
   *
   * Hence a source-level check: the only permitted reference from the client
   * shell to the canvas is the dynamic import.
   */
  const clientSrc = readFileSync(join(__dirname, "StockMapClient.tsx"), "utf8");

  it("only ever reaches StockMapCanvas through a dynamic import", () => {
    const staticImport = /^\s*import\s[^;]*from\s+["']\.\/StockMapCanvas["']/m;
    expect(clientSrc).not.toMatch(staticImport);
    expect(clientSrc).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(["']\.\/StockMapCanvas["']\)/);
  });

  it("takes its styling constants from the Leaflet-free module", () => {
    expect(clientSrc).toMatch(/from\s+["']\.\/bands["']/);
  });

  it("bands.ts stays free of Leaflet, or the extraction was pointless", () => {
    const bandsSrc = readFileSync(join(__dirname, "bands.ts"), "utf8");
    expect(bandsSrc).not.toMatch(/from\s+["']leaflet/);
  });
});

describe("basemaps", () => {
  it("offers streets plus two imagery views, all keyless", () => {
    expect(BASEMAP_ORDER).toEqual(["streets", "satellite", "hybrid"]);
    for (const id of BASEMAP_ORDER) {
      const def = BASEMAPS[id];
      expect(def.url).toMatch(/^https:\/\//);
      // A key in the tile URL would mean a billing account and a secret in the
      // client bundle. Every source here must stay keyless.
      expect(def.url).not.toMatch(/apikey|api_key|access_token|[?&]key=/i);
      expect(def.attribution).toBeTruthy();
    }
  });

  it("uses Esri's row/col tile order for imagery and XYZ for OSM", () => {
    // Esri serves {z}/{y}/{x} — swapping these silently returns the wrong
    // part of the world rather than erroring.
    expect(BASEMAPS.satellite.url).toContain("/tile/{z}/{y}/{x}");
    expect(BASEMAPS.hybrid.url).toContain("/tile/{z}/{y}/{x}");
    expect(BASEMAPS.streets.url).toContain("/{z}/{x}/{y}.png");
  });

  it("only the hybrid view carries a label overlay", () => {
    expect(BASEMAPS.streets.labelsUrl).toBeUndefined();
    expect(BASEMAPS.satellite.labelsUrl).toBeUndefined();
    expect(BASEMAPS.hybrid.labelsUrl).toMatch(/^https:\/\//);
  });

  it("lets imagery overzoom past the last real tile instead of going blank", () => {
    for (const id of ["satellite", "hybrid"] as const) {
      expect(BASEMAPS[id].maxZoom).toBeGreaterThan(BASEMAPS[id].maxNativeZoom);
    }
  });

  it("coerces anything unrecognised back to the default", () => {
    expect(coerceBasemap("satellite")).toBe("satellite");
    expect(coerceBasemap("hybrid")).toBe("hybrid");
    expect(coerceBasemap("streets")).toBe("streets");
    expect(coerceBasemap(null)).toBe(DEFAULT_BASEMAP);
    expect(coerceBasemap("")).toBe(DEFAULT_BASEMAP);
    expect(coerceBasemap("mapbox-satellite")).toBe(DEFAULT_BASEMAP);
  });
});

describe("street view links", () => {
  it("points Street View at an actual panorama for a coordinate", () => {
    const u = streetViewUrl(-37.8354, 144.6647);
    expect(u).toContain("map_action=pano");
    expect(u).toContain("viewpoint=-37.8354,144.6647");
  });

  it("searches the full address, so a street name isn't matched in the wrong state", () => {
    const u = addressMapsUrl("51 Stonecrop Drive", "Cobblebank", "VIC");
    const q = decodeURIComponent(new URL(u).searchParams.get("query") ?? "");
    expect(q).toBe("51 Stonecrop Drive, Cobblebank, VIC, Australia");
  });

  it("still builds a usable query when suburb or state is missing", () => {
    const q = decodeURIComponent(
      new URL(addressMapsUrl("135 Carnaby Way", null, null)).searchParams.get("query") ?? "",
    );
    expect(q).toBe("135 Carnaby Way, Australia");
  });

  it("escapes an address rather than breaking the URL", () => {
    const u = addressMapsUrl("Unit 3/12 O'Hara & Sons Rd", "Townsville", "QLD");
    expect(() => new URL(u)).not.toThrow();
    expect(u).not.toContain(" ");
  });
});
