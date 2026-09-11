import { describe, it, expect } from "vitest";
import {
  assertNoForbiddenKeys,
  canTransition,
  canUse,
  featuresFor,
  feeRuleFromEnv,
  FORBIDDEN_PARTNER_KEYS,
  isPartnerPortalPath,
  lotAvailability,
  NEXTKEY_BRANDING,
  normaliseTier,
  parseBranding,
  parseClientInput,
  parseReveal,
  partnerMayWithdraw,
  partnerTablesMissing,
  redactSupplierNames,
  referralFee,
  resolveBranding,
  revealedForPortal,
  toPartnerLot,
  type StockRow,
} from "./partner";
import { isPublicPartnerRoute, isPublicSurface } from "../proxy";

/**
 * The partner portal's promises, pinned as tests:
 *   1. the supplier (builder, estate, lot, address) never reaches a partner
 *   2. a partner sees their fee, never the gross fee or NextKey's share
 *   3. NextKey keeps at least $10k on every channel sale
 *   4. a plan can only unlock what it paid for; white-label is staff-granted
 *   5. the public carve-out covers /partner and nothing else
 */

const ROW: StockRow = {
  id: "0f3a9c2e-1111-4222-8333-444455556666",
  builder_name: "Acme Homes",
  builder_id: "b-1",
  estate_name: "Riverstone Rise",
  lot_number: "417",
  street_address: "12 Example Street",
  suburb: "Ripley",
  state: "QLD",
  property_type: "House & Land",
  bedrooms: 4,
  bathrooms: 2,
  car_spaces: 2,
  study_room: 1,
  land_size_sqm: 448,
  house_size: 210.4,
  frontage_m: 14,
  total_package_price: 689000,
  land_price: 289000,
  house_price: 400000,
  contract_type: "split",
  titled: false,
  completion_date: "Riverstone Rise Stage 4B — Q3-27",
  land_registration_date: "Due Nov-26",
  expected_rent_weekly: 620,
  status: "Available",
  pipeline_status: "active",
  brochure_url: "https://acme.example/brochure.pdf",
  floorplan_url: "https://acme.example/plan.pdf",
  description: "A stunning Acme Homes design in Riverstone Rise",
  inclusions: "Acme Platinum inclusions",
  rebates: "$15,000 Acme rebate",
  specs: { design: "Acme Hampton 250" },
  source_email_id: "msg-123",
  source_document_url: "https://acme.example/stocklist.pdf",
  ocr_text: "ACME HOMES STOCKLIST",
  updated_at: "2026-09-10T00:00:00Z",
};

const NAMES = ["Riverstone Rise", "Acme Homes", "Acme"];

describe("toPartnerLot — the supplier never reaches a partner", () => {
  const lot = toPartnerLot(ROW, { referralFee: 12345, heldByPartnerDeal: false, supplierNames: NAMES });
  const json = JSON.stringify(lot);

  it("carries none of the supplier-identifying values", () => {
    for (const secret of ["Acme", "Riverstone", "417", "12 Example Street", "acme.example", "msg-123", "Hampton"]) {
      expect(json).not.toContain(secret);
    }
  });

  it("carries none of the forbidden keys", () => {
    for (const key of FORBIDDEN_PARTNER_KEYS) expect(json).not.toContain(`"${key}"`);
    expect(() => assertNoForbiddenKeys(lot)).not.toThrow();
  });

  it("scrubs a supplier name out of the free text that does come through", () => {
    expect(lot.completion).toBe("— Stage 4B — Q3-27");
  });

  it("keeps what a partner needs to sell", () => {
    expect(lot).toMatchObject({
      suburb: "Ripley",
      state: "QLD",
      bedrooms: 4,
      study: true,
      landSizeSqm: 448,
      price: 689000,
      landPrice: 289000,
      buildPrice: 400000,
      contract: "Two-part contract",
      rentWeekly: 620,
      availability: "available",
      referralFee: 12345,
    });
    expect(lot.ref).toMatch(/^NK-[0-9A-F]{6}$/);
  });

  it("is a whitelist: a column added to the stock table tomorrow does not appear", () => {
    const withNew = toPartnerLot({ ...ROW, supplier_commission: 42000, developer_contact: "x@y" }, {
      referralFee: null,
      heldByPartnerDeal: false,
    });
    const s = JSON.stringify(withNew);
    expect(s).not.toContain("42000");
    expect(s).not.toContain("developer_contact");
  });
});

describe("assertNoForbiddenKeys — the tripwire", () => {
  it("throws on a leaked builder, fee or staff field anywhere in the payload", () => {
    expect(() => assertNoForbiddenKeys({ lots: [{ builder_name: "x" }] })).toThrow(/PARTNER_PAYLOAD_LEAK/);
    expect(() => assertNoForbiddenKeys({ gross_developer_fee: 1 })).toThrow();
    expect(() => assertNoForbiddenKeys({ deal: { staff_notes: "x" } })).toThrow();
  });

  it("lets a deliberate reveal through, because it travels as label/value pairs", () => {
    const view = { lotDetails: revealedForPortal({ builder_name: "Acme Homes", lot_number: "417" }) };
    expect(() => assertNoForbiddenKeys(view)).not.toThrow();
    expect(view.lotDetails).toEqual([
      { label: "Builder", value: "Acme Homes" },
      { label: "Lot", value: "417" },
    ]);
  });
});

describe("redactSupplierNames", () => {
  it("is whole-word and case-insensitive", () => {
    expect(redactSupplierNames("acme homes stage 2", ["Acme Homes"])).toBe("— stage 2");
    expect(redactSupplierNames("Acmeville", ["Acme"])).toBe("Acmeville");
  });
  it("ignores names too short to be a name", () => {
    expect(redactSupplierNames("The lot", ["The"])).toBe("The lot");
  });
  it("copes with regex characters in a name", () => {
    expect(redactSupplierNames("Stage (2) by A+B Homes", ["A+B Homes"])).toBe("Stage (2) by —");
  });
});

describe("referralFee — the partner's share only, and NextKey keeps at least $10k", () => {
  it("PropChannel's worked example: $35k gross → partner $24,500", () => {
    expect(referralFee(35000)).toBe(24500);
  });
  it("uses the floor when 30% is less than $10k", () => {
    expect(referralFee(30000)).toBe(20000);
  });
  it("offers nothing when the fee is too small to share", () => {
    expect(referralFee(10000)).toBeNull();
    expect(referralFee(9500)).toBeNull();
  });
  it("offers nothing without a recorded fee", () => {
    for (const v of [null, undefined, "", "abc", 0, -5]) expect(referralFee(v)).toBeNull();
  });
  it("never lets configuration drop NextKey below $10k", () => {
    const rule = feeRuleFromEnv({ PARTNER_FEE_FLOOR: "2000", PARTNER_FEE_PERCENT: "0" });
    expect(rule.floor).toBe(10000);
    expect(referralFee(15000, rule)).toBe(5000);
  });
  it("falls back to 30% on a nonsense percentage", () => {
    expect(feeRuleFromEnv({ PARTNER_FEE_PERCENT: "150" }).percent).toBe(30);
    expect(feeRuleFromEnv({ PARTNER_FEE_PERCENT: "banana" }).percent).toBe(30);
    expect(feeRuleFromEnv({}).percent).toBe(30);
  });
});

describe("lotAvailability — free-text builder status reduced to three states", () => {
  it.each([
    ["Available", "available"],
    ["Built and rented @ $2,955 per month", "available"],
    ["Hold", "on_hold"],
    ["Completed Build - TBCG HOLD", "on_hold"],
    ["Sold", "unavailable"],
    ["SETTLED", "unavailable"],
    ["Completed Build - UNDER CONTRACT", "unavailable"],
    ["Leased at $520pw 17/07/2026 - 16/07/2027 - UNDER CONTRACT", "unavailable"],
  ])("%s → %s", (status, expected) => {
    expect(lotAvailability(status, "active")).toBe(expected);
  });
  it("anything not active in the pipeline is unavailable", () => {
    expect(lotAvailability("Available", "withdrawn")).toBe("unavailable");
    expect(lotAvailability("Available", "on_hold")).toBe("unavailable");
    expect(lotAvailability("Available", null)).toBe("unavailable");
  });
  it("a partner deal holds the lot for everyone else", () => {
    expect(lotAvailability("Available", "active", true)).toBe("on_hold");
  });
});

describe("tiers and features", () => {
  it("basic gets the core portal and nothing else", () => {
    const f = featuresFor("basic", []);
    expect([...f].sort()).toEqual(["clients", "deals", "referral_fee", "stock"]);
    expect(canUse(f, "white_label")).toBe(false);
  });
  it("an unknown tier reads as basic, never wider", () => {
    expect(normaliseTier("platinum")).toBe("basic");
    expect(canUse(featuresFor("platinum", []), "white_label")).toBe(false);
  });
  it("white-label can be granted on request on any tier", () => {
    expect(canUse(featuresFor("basic", ["white_label"]), "white_label")).toBe(true);
  });
  it("a bogus grant is dropped rather than trusted", () => {
    expect([...featuresFor("basic", ["root", 7, null])]).not.toContain("root");
  });
  it("a feature that isn't built is never usable, even when held", () => {
    expect(canUse(featuresFor("enterprise", []), "lot_sheets")).toBe(false);
  });
});

describe("branding — staff-set, validated, applied only with white_label", () => {
  const wl = featuresFor("basic", ["white_label"]);
  const stored = { display_name: "Harbour Property", logo_url: "https://harbour.example/logo.png", primary_color: "#112233", accent_color: "#AABBCC" };

  it("applies the firm's branding when they hold white_label", () => {
    expect(resolveBranding("Harbour Pty Ltd", wl, stored)).toEqual({
      displayName: "Harbour Property",
      logoUrl: "https://harbour.example/logo.png",
      primaryColor: "#112233",
      accentColor: "#aabbcc",
      whiteLabel: true,
    });
  });
  it("shows NextKey when they don't, whatever is stored", () => {
    expect(resolveBranding("Harbour", featuresFor("basic", []), stored)).toEqual(NEXTKEY_BRANDING);
  });
  it("rejects anything that could inject into a style attribute or load over http", () => {
    const bad = parseBranding({ logo_url: "javascript:alert(1)", primary_color: "red;background:url(x)", accent_color: "#12345" });
    expect(bad.ok).toBe(false);
    expect(parseBranding({ logo_url: "http://x.example/logo.png" }).ok).toBe(false);
  });
  it("falls back to the firm name and NextKey colours for gaps", () => {
    const b = resolveBranding("Harbour", wl, {});
    expect(b.displayName).toBe("Harbour");
    expect(b.primaryColor).toBe(NEXTKEY_BRANDING.primaryColor);
    expect(b.logoUrl).toBeNull();
  });
});

describe("deal stages", () => {
  it("staff can only move a deal forward along the real path", () => {
    expect(canTransition("requested", "hold")).toBe(true);
    expect(canTransition("hold", "eoi")).toBe(true);
    expect(canTransition("unconditional", "settled")).toBe(true);
    expect(canTransition("requested", "settled")).toBe(false);
    expect(canTransition("settled", "requested")).toBe(false);
    expect(canTransition("declined", "hold")).toBe(false);
  });
  it("a partner can withdraw only before we've acted", () => {
    expect(partnerMayWithdraw("requested")).toBe(true);
    expect(partnerMayWithdraw("hold")).toBe(false);
  });
});

describe("parseReveal", () => {
  it("keeps only the four supplier fields, trimmed", () => {
    expect(parseReveal({ builder_name: " Acme ", lot_number: "417", gross_developer_fee: 40000, x: "y" })).toEqual({
      builder_name: "Acme",
      lot_number: "417",
    });
  });
});

describe("parseClientInput", () => {
  it("needs a first name and one way to reach them", () => {
    expect(parseClientInput({ last_name: "Smith", email: "a@b.co" }).ok).toBe(false);
    expect(parseClientInput({ first_name: "Jo" }).ok).toBe(false);
    expect(parseClientInput({ first_name: "Jo", phone: "0400 000 000" }).ok).toBe(true);
  });
  it("normalises email and state, and rejects a non-Australian state", () => {
    const r = parseClientInput({ first_name: "Jo", email: " JO@Example.COM ", state: "qld", budget_max: "750000" });
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ email: "jo@example.com", state: "QLD", budget_max: 750000 }) });
    expect(parseClientInput({ first_name: "Jo", email: "jo@example.com", state: "CA" }).ok).toBe(false);
  });
});

describe("the public carve-out covers /partner and nothing else", () => {
  it("exempts the portal and its API", () => {
    for (const p of ["/partner", "/partner/stock", "/partner/deals/abc", "/api/partner/verify", "/api/partner/stock"]) {
      expect(isPublicPartnerRoute(p)).toBe(true);
      expect(isPartnerPortalPath(p.startsWith("/api/") ? "/partner" : p)).toBe(true);
    }
  });
  it("does NOT exempt the staff side or anything that merely starts with 'partner'", () => {
    for (const p of [
      "/partners", "/partners/x", "/admin/partners", "/api/admin/partners", "/api/admin/partners/deals/x",
      "/api/partners", "/api/partners/x", "/channel-partners", "/api/partner", "/partnership",
    ]) {
      expect(isPublicPartnerRoute(p)).toBe(false);
    }
    expect(isPartnerPortalPath("/partners")).toBe(false);
    expect(isPartnerPortalPath("/admin/partners")).toBe(false);
  });
});

describe("isPublicSurface — pages that must not carry the staff sidebar", () => {
  it("covers every page an outsider opens", () => {
    for (const p of ["/partner", "/partner/stock", "/introducer/clients", "/sign/tok", "/book/glenn", "/portal/tok", "/join/tok"]) {
      expect(isPublicSurface(p)).toBe(true);
    }
  });
  it("never covers a staff page", () => {
    for (const p of ["/", "/admin/partners", "/admin/introducers", "/contacts", "/partners", "/channel-partners", "/properties"]) {
      expect(isPublicSurface(p)).toBe(false);
    }
  });
});

describe("partnerTablesMissing", () => {
  it("matches table-level codes only, never column errors", () => {
    expect(partnerTablesMissing({ code: "42P01" })).toBe(true);
    expect(partnerTablesMissing({ code: "PGRST205" })).toBe(true);
    expect(partnerTablesMissing({ code: "42703" })).toBe(false);
    expect(partnerTablesMissing({ code: "PGRST204" })).toBe(false);
    expect(partnerTablesMissing(null)).toBe(false);
  });
});
