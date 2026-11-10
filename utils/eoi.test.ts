import { describe, it, expect } from "vitest";
import {
  emptyEoi,
  hydrateEoi,
  buyerNamesLine,
  buyerEmailsLine,
  buyerMobilesLine,
  eoiSummary,
  eoiProposedSigners,
  eoiOutstanding,
  formatEoiPrice,
  eoiPrefill,
  eoisTableMissing,
  eoiErrMessage,
} from "./eoi";

describe("hydrateEoi", () => {
  it("fills a blank template from empty/garbage input", () => {
    expect(hydrateEoi(null)).toEqual(emptyEoi());
    expect(hydrateEoi("nope").buyers).toEqual([{ fullName: "", email: "", mobile: "" }]);
  });

  it("keeps a stored buyers array and nested objects", () => {
    const h = hydrateEoi({
      buyers: [{ fullName: "Daniel Bailey", email: "d@x.com", mobile: "0466" }],
      property: { address: "Natalia Rise", purchasePrice: 750000 },
      finance: { subjectToFinance: false, settlementTerm: "14" },
    });
    expect(h.buyers).toHaveLength(1);
    expect(h.property.purchasePrice).toBe(750000);
    expect(h.finance.subjectToFinance).toBe(false);
    expect(h.finance.settlementTerm).toBe("14");
  });

  it("normalises an empty buyers array to one blank row", () => {
    expect(hydrateEoi({ buyers: [] }).buyers).toEqual([{ fullName: "", email: "", mobile: "" }]);
  });

  it("treats an unknown term option as blank", () => {
    expect(hydrateEoi({ finance: { financeTerm: "99" } }).finance.financeTerm).toBe("");
  });
});

describe("free-text line reconstruction", () => {
  const eoi = hydrateEoi({
    buyers: [
      { fullName: "Daniel Colin Bailey", email: "danny@x.com", mobile: "0466 578 118" },
      { fullName: "Alison Claire Bailey", email: "ali@x.com", mobile: "0437 240 673" },
    ],
  });
  it("joins buyer names with 'and'", () => {
    expect(buyerNamesLine(eoi)).toBe("Daniel Colin Bailey and Alison Claire Bailey");
  });
  it("joins emails", () => {
    expect(buyerEmailsLine(eoi)).toBe("danny@x.com and ali@x.com");
  });
  it("labels each mobile with the buyer's first name", () => {
    expect(buyerMobilesLine(eoi)).toBe("0466 578 118 (Daniel)\n0437 240 673 (Alison)");
  });
  it("ignores unnamed buyer rows", () => {
    const withBlank = hydrateEoi({ buyers: [{ fullName: "Jane Smith", email: "j@x.com" }, { fullName: "" }] });
    expect(buyerNamesLine(withBlank)).toBe("Jane Smith");
  });
});

describe("summary + signers", () => {
  it("prefers the purchasing entity, else buyer names", () => {
    const e = hydrateEoi({ purchasingEntity: "Bailey Family SMSF", property: { address: "Natalia Rise" } });
    expect(eoiSummary(e)).toBe("Bailey Family SMSF — Natalia Rise");
    const e2 = hydrateEoi({ buyers: [{ fullName: "Jane Smith", email: "" }], property: { address: "Lot 5" } });
    expect(eoiSummary(e2)).toBe("Jane Smith — Lot 5");
  });

  it("proposes signers from named buyers with emails", () => {
    const e = hydrateEoi({ buyers: [{ fullName: "Jane Smith", email: "j@x.com", mobile: "" }] });
    expect(eoiProposedSigners(e)).toEqual([{ name: "Jane Smith", email: "j@x.com" }]);
  });
});

describe("eoiOutstanding", () => {
  it("flags the blank essentials", () => {
    const missing = eoiOutstanding(emptyEoi());
    expect(missing).toContain("Buyer name");
    expect(missing).toContain("Property address");
  });
  it("flags a buyer missing an email for signing", () => {
    const e = hydrateEoi({ buyers: [{ fullName: "Jane Smith", email: "" }], property: { address: "Lot 5", purchasePrice: 500000 } });
    expect(eoiOutstanding(e)).toContain("Buyer email (for signing)");
  });
});

describe("formatEoiPrice", () => {
  it("renders TBC for null and AUD for a number", () => {
    expect(formatEoiPrice(null)).toBe("TBC");
    expect(formatEoiPrice(750000)).toBe("$750,000");
  });
});

describe("eoiPrefill", () => {
  it("seeds property, buyer and broker from CRM data", () => {
    const e = eoiPrefill({
      property: { street_address: "1 Test St", suburb: "Brighton", state: "VIC", total_package_price: 800000 },
      contact: { full_name: "Daniel Bailey", email: "d@x.com", phone: "0466", home_address_street: "1 Alford St", home_address_suburb: "Brighton East" },
      broker: { name: "Damian Pisano", email: "damian@x.com" },
      today: "2026-07-15",
    });
    expect(e.date).toBe("2026-07-15");
    expect(e.property.address).toBe("1 Test St, Brighton, VIC");
    expect(e.property.purchasePrice).toBe(800000);
    expect(e.buyers[0]).toEqual({ fullName: "Daniel Bailey", email: "d@x.com", mobile: "0466" });
    expect(e.buyerAddress).toBe("1 Alford St, Brighton East");
    expect(e.broker.name).toBe("Damian Pisano");
  });

  it("uses estate + lot when there's no street address (off-plan)", () => {
    const e = eoiPrefill({ property: { estate_name: "Natalia Rise", lot_number: "42" } });
    expect(e.property.address).toBe("Natalia Rise (Lot 42)");
  });

  it("falls back to the builder name when there's no address or estate", () => {
    const e = eoiPrefill({ property: { builder_name: "Natalia Rise Estate" } });
    expect(e.property.address).toBe("Natalia Rise Estate");
  });
});

describe("table-missing helper", () => {
  it("distinguishes a missing table from a missing column", () => {
    expect(eoisTableMissing({ code: "42P01" })).toBe(true);
    expect(eoisTableMissing({ code: "42703" })).toBe(false);
    expect(eoisTableMissing(null)).toBe(false);
  });
  it("extracts an error message", () => {
    expect(eoiErrMessage(new Error("boom"), "fb")).toBe("boom");
    expect(eoiErrMessage({}, "fb")).toBe("fb");
  });
});
