import { describe, expect, it } from "vitest";
import { toSheetLot, sheetTitle, LOT_SHEET_DISCLAIMER } from "./partner-lot-sheet";
import { PARTNER_FEATURES, TIER_DEFINITIONS, type PartnerLot } from "./partner";

const lot: PartnerLot = {
  id: "6de124c2-1e24-4907-a131-58e61016f24d",
  ref: "NK-6DE124",
  suburb: "Yarrawonga",
  state: "VIC",
  propertyType: "House & Land",
  bedrooms: 4,
  bathrooms: 2,
  carSpaces: 2,
  study: false,
  landSizeSqm: 779,
  houseSizeSqm: 204,
  frontageM: null,
  price: 739900,
  landPrice: 300000,
  buildPrice: 439900,
  contract: "Two-part",
  titled: true,
  completion: null,
  landRegistration: null,
  rentWeekly: 550,
  availability: "available",
  referralFee: 28000,
  updatedAt: "2026-11-17T00:00:00Z",
  listedAt: "2026-11-10T00:00:00Z",
};

describe("toSheetLot", () => {
  it("never carries the referral fee, the stock id or the update stamp", () => {
    const sheet = toSheetLot(lot);
    const json = JSON.stringify(sheet);
    expect(json).not.toContain("28000");
    expect(json).not.toContain("referralFee");
    expect(json).not.toContain(lot.id);
    expect(json).not.toContain("updatedAt");
  });
  it("picks fields explicitly: a new PartnerLot field does not reach the sheet", () => {
    const withExtra = { ...lot, secretInternal: "x" } as PartnerLot & { secretInternal: string };
    expect(Object.keys(toSheetLot(withExtra))).not.toContain("secretInternal");
  });
  it("keeps what a buyer needs", () => {
    const s = toSheetLot(lot);
    expect(s.ref).toBe("NK-6DE124");
    expect(s.price).toBe(739900);
    expect(sheetTitle(s)).toBe("4 bed House & Land, Yarrawonga VIC");
  });
});

describe("plans", () => {
  it("lot sheets are built and come with Professional and Enterprise, not Basic", () => {
    expect(PARTNER_FEATURES.lot_sheets.built).toBe(true);
    expect(TIER_DEFINITIONS.basic.features).not.toContain("lot_sheets");
    expect(TIER_DEFINITIONS.professional.features).toContain("lot_sheets");
    expect(TIER_DEFINITIONS.enterprise.features).toContain("lot_sheets");
  });
  it("the printed disclaimer names no brand (white-label firms hand it out)", () => {
    expect(LOT_SHEET_DISCLAIMER).not.toMatch(/NextKey|Springboard/);
  });
});
