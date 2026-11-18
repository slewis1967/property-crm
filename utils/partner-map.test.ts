import { describe, expect, it } from "vitest";
import type { PartnerLot } from "./partner";
import type { SuburbPoint } from "./geo/suburbs";
import { lotSuburbKeys, partnerMapClusters } from "./partner-map";

function lot(over: Partial<PartnerLot>): PartnerLot {
  return {
    id: "x",
    ref: "NK-0001",
    suburb: null,
    state: null,
    propertyType: "House",
    bedrooms: 4,
    bathrooms: 2,
    carSpaces: 2,
    study: false,
    landSizeSqm: 400,
    houseSizeSqm: null,
    frontageM: null,
    price: 600_000,
    landPrice: null,
    buildPrice: null,
    contract: null,
    titled: null,
    completion: null,
    landRegistration: null,
    rentWeekly: null,
    availability: "available",
    referralFee: null,
    updatedAt: null,
    listedAt: null,
    ...over,
  };
}

const pt = (key: string, lat: number, lng: number): [string, SuburbPoint] => {
  const [suburb, state] = key.split("|");
  return [key, { key, suburb, state, lat, lng }];
};

describe("partnerMapClusters", () => {
  const points = new Map([pt("RIPLEY|QLD", -27.67, 152.79), pt("TARNEIT|VIC", -37.83, 144.69)]);

  it("groups by suburb case-insensitively and counts unplaced lots", () => {
    const { clusters, unplaced } = partnerMapClusters(
      [
        lot({ id: "a", suburb: "Ripley", state: "QLD", price: 500_000 }),
        lot({ id: "b", suburb: "RIPLEY ", state: "qld", price: 700_000, availability: "on_hold" }),
        lot({ id: "c", suburb: "Tarneit", state: "VIC", price: null }),
        lot({ id: "d", suburb: "Nowhere", state: "WA" }),
        lot({ id: "e", suburb: null }),
      ],
      points,
    );
    expect(unplaced).toBe(2);
    expect(clusters.map((c) => c.suburb)).toEqual(["Ripley", "Tarneit"]);
    const ripley = clusters[0];
    expect(ripley).toMatchObject({ count: 2, available: 1, minPrice: 500_000, maxPrice: 700_000, medianPrice: 600_000, state: "QLD" });
    expect(clusters[1]).toMatchObject({ minPrice: null, medianPrice: null });
  });

  it("lists available lots first, cheapest first", () => {
    const { clusters } = partnerMapClusters(
      [
        lot({ id: "held", suburb: "Ripley", state: "QLD", price: 400_000, availability: "on_hold" }),
        lot({ id: "dear", suburb: "Ripley", state: "QLD", price: 900_000 }),
        lot({ id: "cheap", suburb: "Ripley", state: "QLD", price: 450_000 }),
      ],
      points,
    );
    expect(clusters[0].lots.map((l) => l.id)).toEqual(["cheap", "dear", "held"]);
  });

  it("carries only masked fields to the browser", () => {
    const { clusters } = partnerMapClusters([lot({ id: "a", suburb: "Ripley", state: "QLD", referralFee: 9000 })], points);
    expect(Object.keys(clusters[0].lots[0]).sort()).toEqual(
      ["availability", "baths", "beds", "cars", "id", "landSqm", "price", "ref", "type"].sort(),
    );
  });
});

describe("lotSuburbKeys", () => {
  it("returns distinct normalised keys and skips lots with no suburb", () => {
    expect(
      lotSuburbKeys([lot({ suburb: "Ripley", state: "QLD" }), lot({ suburb: "ripley", state: "Qld" }), lot({ suburb: "" })]),
    ).toEqual(["RIPLEY|QLD"]);
  });
});
