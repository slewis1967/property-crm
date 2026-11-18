import { describe, expect, it } from "vitest";
import { findStockSuburb, stockSuburbs, OUR_BRAND_NAMES, SUBURB_REPORT_DISCLAIMER } from "./partner-suburbs";
import { redactSupplierNames, type PartnerLot } from "./partner";

function lot(over: Partial<PartnerLot>): PartnerLot {
  return {
    id: "x", ref: "NK-X", suburb: "Kialla", state: "VIC", propertyType: null, bedrooms: null, bathrooms: null,
    carSpaces: null, study: false, landSizeSqm: null, houseSizeSqm: null, frontageM: null, price: null,
    landPrice: null, buildPrice: null, contract: null, titled: null, completion: null, landRegistration: null,
    rentWeekly: null, availability: "available", referralFee: null, updatedAt: null, listedAt: null, ...over,
  };
}

describe("stockSuburbs", () => {
  const list = stockSuburbs([
    lot({ price: 700000 }),
    lot({ price: 650000, availability: "on_hold" }),
    lot({ suburb: "kialla ", state: "vic", price: 720000 }),
    lot({ suburb: "Traralgon", price: 600000 }),
    lot({ suburb: null }),
  ]);
  it("groups case-insensitively, counts and ranges prices", () => {
    expect(list[0]).toMatchObject({ suburb: "Kialla", state: "VIC", count: 3, available: 2, minPrice: 650000, maxPrice: 720000 });
    expect(list).toHaveLength(2);
  });
  it("only suburbs in the stock book can be researched", () => {
    expect(findStockSuburb(list, "KIALLA", "vic")?.suburb).toBe("Kialla");
    expect(findStockSuburb(list, "Kialla", "NSW")).toBeUndefined();
    expect(findStockSuburb(list, "Bondi", "NSW")).toBeUndefined();
    expect(findStockSuburb(list, undefined, "VIC")).toBeUndefined();
  });
});

describe("brand scrubbing", () => {
  it("removes our own name from research shown under a partner's brand", () => {
    const out = redactSupplierNames("NextKey Property Strategists notes that NextKey sees demand.", [...OUR_BRAND_NAMES]);
    expect(out).not.toMatch(/NextKey/);
  });
  it("the printed disclaimer names no brand", () => {
    expect(SUBURB_REPORT_DISCLAIMER).not.toMatch(/NextKey|Springboard/);
  });
});
