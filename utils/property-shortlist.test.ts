import { describe, it, expect } from "vitest";
import {
  computeReport,
  DEFAULT_ASSUMPTIONS,
  lotFromSnapshot,
  monthlyRepayment,
  parseAssumptions,
  parseCreateItems,
  parseResponseInput,
  parseTtlDays,
  SHORTLIST_MAX_IMAGES,
  SHORTLIST_MAX_ITEMS,
  shortlistImageUrls,
  shortlistSuburbs,
  shortlistUsable,
  toClientLotView,
  toClientProperty,
} from "./property-shortlist";
import { assertNoForbiddenKeys, type StockRow } from "./partner";
import { isShortlistPortalPath } from "./shortlist-path";
import { isPublicShortlistRoute } from "../proxy";

/**
 * The shortlist's promises, pinned as tests:
 *   1. the supplier (builder, estate, lot, address) and our fee never reach a client
 *   2. photo URLs — whose paths name the estate — are never sent, and only our own
 *      storage is ever fetched
 *   3. the report arithmetic is right, and admits what it doesn't know
 *   4. the public carve-out covers /shortlist and nothing else
 */

const ROW: StockRow = {
  id: "0f3a9c2e-1111-4222-8333-444455556666",
  builder_name: "Acme Homes",
  estate_name: "Riverstone Rise",
  lot_number: "214",
  street_address: "12 Hidden Street",
  brochure_url: "https://acme.example/brochure.pdf",
  description: "Acme Homes Riverstone design",
  inclusions: "Riverstone Rise inclusions",
  suburb: "Logan Reserve",
  state: "QLD",
  property_type: "House & Land",
  bedrooms: 4,
  bathrooms: 2,
  car_spaces: 2,
  study_room: 1,
  land_size_sqm: 400,
  house_size: 190,
  frontage_m: 12.5,
  total_package_price: 650000,
  land_price: 300000,
  build_price: 350000,
  contract_type: "split",
  titled: true,
  completion_date: "Riverstone Rise stage 3, Q2 2027",
  land_registration_date: null,
  expected_rent_weekly: 620,
  status: "Available",
  pipeline_status: "active",
  updated_at: "2026-09-10T00:00:00Z",
};

const ITEM = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  rent_weekly_override: null,
  staff_note: "Close to the new school.",
  client_response: null,
  client_note: null,
  responded_at: null,
};

describe("client view masking", () => {
  const lot = toClientLotView(ROW, ["Acme Homes", "Riverstone Rise"]);
  const property = toClientProperty(lot, ITEM, 3);
  const json = JSON.stringify(property);

  it("never carries the supplier, the brochure or free-text descriptions", () => {
    for (const leak of ["Acme", "Riverstone", "Hidden Street", "214", "brochure", "inclusions"]) {
      expect(json).not.toContain(leak);
    }
  });

  it("passes the partner portal's forbidden-key tripwire", () => {
    expect(() => assertNoForbiddenKeys(property)).not.toThrow();
  });

  it("never carries a referral fee or the stock id", () => {
    expect(json).not.toMatch(/referral/i);
    expect(json).not.toContain(ROW.id);
  });

  it("scrubs supplier names out of the short free-text fields it does carry", () => {
    expect(property.completion).toBe("— stage 3, Q2 2027");
  });

  it("keeps the facts a client needs", () => {
    expect(property).toMatchObject({
      suburb: "Logan Reserve",
      state: "QLD",
      bedrooms: 4,
      price: 650000,
      landPrice: 300000,
      contract: "Two-part contract",
      rentWeekly: 620,
      rentSource: "listing",
      availability: "available",
      imageCount: 3,
      staffNote: "Close to the new school.",
    });
  });

  it("prefers the consultant's rent over the listing's", () => {
    const p = toClientProperty(lot, { ...ITEM, rent_weekly_override: "700" }, 0);
    expect(p.rentWeekly).toBe(700);
    expect(p.rentSource).toBe("consultant");
  });

  it("ignores a response value it doesn't recognise", () => {
    expect(toClientProperty(lot, { ...ITEM, client_response: "maybe" }, 0).response).toBeNull();
  });

  it("reads a snapshot back as unavailable, dropping unknown keys", () => {
    const back = lotFromSnapshot({ ...lot, builder_name: "Acme Homes", availability: "available" });
    expect(back?.availability).toBe("unavailable");
    expect(JSON.stringify(back)).not.toContain("Acme");
    expect(lotFromSnapshot({ nope: true })).toBeNull();
  });
});

describe("shortlistImageUrls", () => {
  const SB = "https://abc.supabase.co";
  const pub = (p: string) => `${SB}/storage/v1/object/public/property-media/${p}`;

  it("orders facade, then brochure_url, then gallery, and dedupes", () => {
    const urls = shortlistImageUrls(
      [
        { kind: "gallery", storage_path: pub("g1.jpg") },
        { kind: "facade", storage_path: pub("f.jpg") },
        { kind: "gallery", storage_path: pub("f.jpg") },
      ],
      pub("b.jpg"),
      SB,
    );
    expect(urls).toEqual([pub("f.jpg"), pub("b.jpg"), pub("g1.jpg")]);
  });

  it("refuses anything that isn't our own public storage (the route would proxy it)", () => {
    const urls = shortlistImageUrls(
      [
        { kind: "facade", storage_path: "https://evil.example/storage/v1/object/public/x.jpg" },
        { kind: "gallery", storage_path: "http://abc.supabase.co/storage/v1/object/public/x.jpg" },
        { kind: "gallery", storage_path: `${SB}/storage/v1/object/sign/private.jpg` },
        { kind: "gallery", storage_path: "not a url" },
      ],
      "https://acme.example/brochure.jpg",
      SB,
    );
    expect(urls).toEqual([]);
  });

  it("leaves out floor plans and brochure PDFs, which carry the builder's name", () => {
    const urls = shortlistImageUrls(
      [
        { kind: "floorplan", storage_path: pub("fp.jpg") },
        { kind: "brochure_pdf", storage_path: pub("source.pdf") },
      ],
      null,
      SB,
    );
    expect(urls).toEqual([]);
  });

  it("caps the count, and returns nothing without a storage origin", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ kind: "gallery", storage_path: pub(`${i}.jpg`) }));
    expect(shortlistImageUrls(many, null, SB)).toHaveLength(SHORTLIST_MAX_IMAGES);
    expect(shortlistImageUrls(many, null, undefined)).toEqual([]);
  });
});

describe("monthlyRepayment", () => {
  it("amortises principal and interest", () => {
    // $500,000 over 30 years at 6% is the textbook $2,997.75/month.
    expect(monthlyRepayment(500_000, 6, 30, "pi")).toBeCloseTo(2997.75, 2);
  });

  it("charges interest only", () => {
    expect(monthlyRepayment(500_000, 6, 30, "io")).toBeCloseTo(2500, 6);
  });

  it("handles a zero rate and a zero loan", () => {
    expect(monthlyRepayment(360_000, 0, 30, "pi")).toBeCloseTo(1000, 6);
    expect(monthlyRepayment(0, 6, 30, "pi")).toBe(0);
  });
});

describe("computeReport", () => {
  const input = { price: 650000, landPrice: 300000, contract: "Two-part contract", state: "QLD", rentWeekly: 620 };

  it("works out deposit, loan, yield and cashflow", () => {
    const r = computeReport(input, DEFAULT_ASSUMPTIONS)!;
    expect(r.deposit).toBe(130000);
    expect(r.loan).toBe(520000);
    expect(r.lmiLikely).toBe(false);
    expect(r.annualRent).toBe(32240);
    expect(r.grossYieldPct).toBe(4.96);
    // Costs: max(25% of rent, 0.9% of value) = max(8,060, 5,850).
    expect(r.annualCosts).toBe(8060);
    const expectedWeekly = (32240 - 8060 - monthlyRepayment(520000, 6.5, 30, "pi") * 12) / 52;
    expect(r.weeklyCashflow).toBe(Math.round(expectedWeekly));
    expect(r.upfrontCash).toBe(r.deposit + (r.duty ?? 0) + r.closingCosts);
  });

  it("charges duty on the land for a two-part package, and on the whole for a single contract", () => {
    const split = computeReport(input, DEFAULT_ASSUMPTIONS)!;
    expect(split.dutyBasis).toBe("land");
    expect(split.dutiableValue).toBe(300000);

    const single = computeReport({ ...input, contract: "Single contract" }, DEFAULT_ASSUMPTIONS)!;
    expect(single.dutyBasis).toBe("package");
    expect(single.dutiableValue).toBe(650000);
    expect(single.duty!).toBeGreaterThan(split.duty!);
  });

  it("applies the first home buyer concession when asked", () => {
    const standard = computeReport(input, DEFAULT_ASSUMPTIONS)!;
    const fhb = computeReport(input, { ...DEFAULT_ASSUMPTIONS, firstHomeBuyer: true })!;
    expect(fhb.duty!).toBeLessThanOrEqual(standard.duty!);
  });

  it("says it doesn't know rather than showing zero", () => {
    const r = computeReport({ ...input, rentWeekly: null, state: "Somewhere" }, DEFAULT_ASSUMPTIONS)!;
    expect(r.duty).toBeNull();
    expect(r.dutyBasis).toBeNull();
    expect(r.grossYieldPct).toBeNull();
    expect(r.weeklyCashflow).toBeNull();
    expect(computeReport({ ...input, price: null }, DEFAULT_ASSUMPTIONS)).toBeNull();
  });

  it("flags LMI below a 20% deposit", () => {
    expect(computeReport(input, { ...DEFAULT_ASSUMPTIONS, depositPct: 10 })!.lmiLikely).toBe(true);
  });
});

describe("parsers", () => {
  it("clamps assumptions and falls back on junk", () => {
    expect(parseAssumptions(null)).toEqual(DEFAULT_ASSUMPTIONS);
    expect(
      parseAssumptions({ depositPct: 150, interestRatePct: -2, loanTermYears: "25.4", repayment: "io", firstHomeBuyer: "yes" }),
    ).toEqual({ depositPct: 100, interestRatePct: 0, loanTermYears: 25, repayment: "io", firstHomeBuyer: false });
  });

  it("bounds the link lifetime", () => {
    expect(parseTtlDays(undefined)).toBe(30);
    expect(parseTtlDays(0)).toBe(1);
    expect(parseTtlDays(365)).toBe(90);
  });

  it("parses the staff item list: dedupes, validates, caps", () => {
    const id = "0f3a9c2e-1111-4222-8333-444455556666";
    const ok = parseCreateItems([id, { propertyId: id }, { propertyId: ITEM.id, rentWeekly: "550", staffNote: "  " }]);
    expect(ok).toEqual({
      ok: true,
      items: [
        { propertyId: id, rentWeekly: null, staffNote: null },
        { propertyId: ITEM.id, rentWeekly: 550, staffNote: null },
      ],
    });
    expect(parseCreateItems([]).ok).toBe(false);
    expect(parseCreateItems(["not-a-uuid"]).ok).toBe(false);
    const tooMany = Array.from({ length: SHORTLIST_MAX_ITEMS + 1 }, (_, i) =>
      `0f3a9c2e-1111-4222-8333-${String(i).padStart(12, "0")}`,
    );
    expect(parseCreateItems(tooMany).ok).toBe(false);
  });

  it("parses a client response, allowing a clear", () => {
    expect(parseResponseInput({ itemId: ITEM.id, response: "interested", note: " yes " })).toEqual({
      ok: true,
      value: { itemId: ITEM.id, response: "interested", note: "yes" },
    });
    expect(parseResponseInput({ itemId: ITEM.id, response: null })).toEqual({
      ok: true,
      value: { itemId: ITEM.id, response: null, note: null },
    });
    expect(parseResponseInput({ itemId: ITEM.id, response: "buy it" }).ok).toBe(false);
    expect(parseResponseInput({ itemId: "x", response: "interested" }).ok).toBe(false);
  });
});

describe("access", () => {
  const now = Date.parse("2026-09-14T00:00:00Z");
  it("works only while active and unexpired", () => {
    expect(shortlistUsable({ status: "active", expires_at: "2026-10-01T00:00:00Z" }, now)).toBe(true);
    expect(shortlistUsable({ status: "revoked", expires_at: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(shortlistUsable({ status: "active", expires_at: "2026-09-01T00:00:00Z" }, now)).toBe(false);
    expect(shortlistUsable({ status: "active", expires_at: null }, now)).toBe(false);
  });

  it("lists each suburb once", () => {
    expect(
      shortlistSuburbs([
        { suburb: "Logan Reserve", state: "qld" },
        { suburb: "logan reserve", state: "QLD" },
        { suburb: null, state: "QLD" },
        { suburb: "Logan Reserve", state: "NSW" },
      ]),
    ).toEqual([
      { suburb: "Logan Reserve", state: "QLD" },
      { suburb: "Logan Reserve", state: "NSW" },
    ]);
  });
});

describe("public carve-out", () => {
  it("covers the client page and its token APIs", () => {
    expect(isPublicShortlistRoute("/shortlist")).toBe(true);
    expect(isPublicShortlistRoute("/shortlist/abc123")).toBe(true);
    expect(isPublicShortlistRoute("/api/shortlist/abc123")).toBe(true);
    expect(isPublicShortlistRoute("/api/shortlist/abc123/respond")).toBe(true);
    expect(isShortlistPortalPath("/shortlist/abc123")).toBe(true);
  });

  it("never covers the staff side or lookalikes", () => {
    for (const p of ["/shortlists", "/property-shortlists", "/api/property-shortlists", "/api/property-shortlists/x", "/api/shortlist", "/api/shortlists/x"]) {
      expect(isPublicShortlistRoute(p)).toBe(false);
    }
    expect(isShortlistPortalPath("/shortlists")).toBe(false);
    expect(isShortlistPortalPath("/property-shortlists")).toBe(false);
  });
});
