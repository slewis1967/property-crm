import { describe, it, expect } from "vitest";
import { buildClusters, distinctKeys, median, rowPrice, type StockRow } from "./clusters";
import { suburbKey, splitKey, type SuburbPoint } from "./suburbs";

const point = (key: string, lat: number, lng: number): SuburbPoint => {
  const { suburb, state } = splitKey(key);
  return { key, suburb, state, lat, lng };
};

const row = (over: Partial<StockRow> = {}): StockRow => ({
  id: Math.random().toString(36).slice(2),
  suburb: "Tarneit",
  state: "VIC",
  builder_name: "Metricon",
  property_type: "House & Land",
  total_package_price: 700_000,
  ...over,
});

describe("suburbKey", () => {
  it("normalises case and internal whitespace so one suburb is one key", () => {
    expect(suburbKey("Cranbourne  East", "vic")).toBe("CRANBOURNE EAST|VIC");
    expect(suburbKey(" cranbourne east ", "VIC")).toBe("CRANBOURNE EAST|VIC");
  });

  it("returns null when there is no suburb to key on", () => {
    expect(suburbKey("", "VIC")).toBeNull();
    expect(suburbKey("   ", "VIC")).toBeNull();
    expect(suburbKey(null, "VIC")).toBeNull();
  });

  it("keeps a missing state distinct rather than guessing one", () => {
    expect(suburbKey("Richmond", null)).toBe("RICHMOND|");
    expect(suburbKey("Richmond", "VIC")).toBe("RICHMOND|VIC");
  });
});

describe("splitKey", () => {
  it("round-trips a key, including suburbs containing a pipe-free comma", () => {
    expect(splitKey("CRANBOURNE EAST|VIC")).toEqual({ suburb: "CRANBOURNE EAST", state: "VIC" });
    expect(splitKey("RICHMOND|")).toEqual({ suburb: "RICHMOND", state: null });
  });
});

describe("rowPrice", () => {
  it("prefers the total package price, matching the feed's price_total", () => {
    expect(rowPrice(row({ total_package_price: 800_000, house_price: 400_000 }))).toBe(800_000);
  });

  it("falls back to house price when there is no package price", () => {
    expect(rowPrice(row({ total_package_price: null, house_price: 420_000 }))).toBe(420_000);
  });

  it("treats zero, negative and missing prices as no price", () => {
    expect(rowPrice(row({ total_package_price: 0, house_price: null }))).toBeNull();
    expect(rowPrice(row({ total_package_price: -1, house_price: null }))).toBeNull();
    expect(rowPrice(row({ total_package_price: null, house_price: null }))).toBeNull();
  });
});

describe("median", () => {
  it("averages the middle pair for an even count", () => {
    expect(median([100, 200, 300, 400])).toBe(250);
  });
  it("takes the middle value for an odd count", () => {
    expect(median([300, 100, 200])).toBe(200);
  });
  it("is null for an empty set", () => {
    expect(median([])).toBeNull();
  });
});

describe("buildClusters", () => {
  const points = new Map<string, SuburbPoint>([
    ["TARNEIT|VIC", point("TARNEIT|VIC", -37.83, 144.66)],
    ["RIPLEY|QLD", point("RIPLEY|QLD", -27.68, 152.79)],
  ]);

  it("groups rows by suburb and summarises price and builders", () => {
    const rows = [
      row({ total_package_price: 600_000 }),
      row({ total_package_price: 800_000, builder_name: "Burbank" }),
      row({ total_package_price: 700_000 }),
      row({ suburb: "Ripley", state: "QLD", total_package_price: 550_000 }),
    ];

    const { clusters, unlocated } = buildClusters(rows, points, new Set());
    expect(unlocated).toEqual([]);
    expect(clusters).toHaveLength(2);

    // Sorted by count descending — Tarneit's 3 leads Ripley's 1.
    const [tarneit, ripley] = clusters;
    expect(tarneit.suburb).toBe("Tarneit");
    expect(tarneit.count).toBe(3);
    expect(tarneit.minPrice).toBe(600_000);
    expect(tarneit.maxPrice).toBe(800_000);
    expect(tarneit.medianPrice).toBe(700_000);
    expect(tarneit.builders).toEqual(["Burbank", "Metricon"]);
    expect(ripley.count).toBe(1);
  });

  it("reports stock it cannot place instead of dropping it", () => {
    const rows = [
      row(),
      row({ suburb: "Nowhereville", state: "VIC" }),
      row({ suburb: "Elsewhere", state: "NSW" }),
      row({ suburb: null, state: "VIC" }),
    ];

    const { clusters, unlocated } = buildClusters(
      rows,
      points,
      new Set(["NOWHEREVILLE|VIC"]),
    );

    expect(clusters).toHaveLength(1);
    // Every row is accounted for: 1 mapped + 3 unlocated.
    const placed = clusters.reduce((n, c) => n + c.count, 0);
    const unplaced = unlocated.reduce((n, u) => n + u.count, 0);
    expect(placed + unplaced).toBe(rows.length);

    const reasons = Object.fromEntries(unlocated.map((u) => [u.suburb, u.reason]));
    // A cached geocode failure and a never-tried suburb are reported
    // differently, because only the latter is worth retrying.
    expect(reasons["Nowhereville"]).toBe("geocode-failed");
    expect(reasons["Elsewhere"]).toBe("not-geocoded");
    expect(reasons["(no suburb recorded)"]).toBe("no-suburb");
  });

  it("still clusters a suburb where no row carries a price", () => {
    const rows = [
      row({ total_package_price: null, house_price: null }),
      row({ total_package_price: null, house_price: null }),
    ];
    const { clusters } = buildClusters(rows, points, new Set());
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].medianPrice).toBeNull();
    expect(clusters[0].minPrice).toBeNull();
  });

  it("displays the suburb as spelled in the data, not the upper-cased key", () => {
    const { clusters } = buildClusters([row({ suburb: "Tarneit" })], points, new Set());
    expect(clusters[0].suburb).toBe("Tarneit");
    expect(clusters[0].key).toBe("TARNEIT|VIC");
  });
});

describe("distinctKeys", () => {
  it("dedupes case variants and skips rows with no suburb", () => {
    const keys = distinctKeys([
      row({ suburb: "Tarneit" }),
      row({ suburb: "TARNEIT" }),
      row({ suburb: null }),
      row({ suburb: "Ripley", state: "QLD" }),
    ]);
    expect(keys).toEqual(["TARNEIT|VIC", "RIPLEY|QLD"]);
  });
});
