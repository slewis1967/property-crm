import { describe, it, expect } from "vitest";
import {
  isValidAbn,
  isValidAcn,
  formatAbn,
  formatAcn,
  validateBusinessDetails,
  introducerEntityColumnMissing,
  digitsOnly,
} from "./introducer-entity";

// Real, publicly-listed check digits. ABNs/ACNs here are valid-by-algorithm.
const GOOD_ABN = "51 824 753 556"; // ATO's own published example
const GOOD_ACN = "004 085 616"; // ASIC's published example

describe("isValidAbn", () => {
  it("accepts a correctly checksummed ABN, spaced or not", () => {
    expect(isValidAbn(GOOD_ABN)).toBe(true);
    expect(isValidAbn(digitsOnly(GOOD_ABN))).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(isValidAbn("5182475355")).toBe(false);
    expect(isValidAbn("518247535561")).toBe(false);
    expect(isValidAbn("")).toBe(false);
  });

  it("rejects a transposition — the reason we checksum instead of counting digits", () => {
    expect(isValidAbn("51 824 753 565")).toBe(false);
    expect(isValidAbn("15 824 753 556")).toBe(false);
  });

  it("rejects an all-zero string that is the right length", () => {
    expect(isValidAbn("00000000000")).toBe(false);
  });
});

describe("isValidAcn", () => {
  it("accepts a correctly checksummed ACN", () => {
    expect(isValidAcn(GOOD_ACN)).toBe(true);
    expect(isValidAcn(digitsOnly(GOOD_ACN))).toBe(true);
  });

  it("rejects the wrong length and a bad check digit", () => {
    expect(isValidAcn("00408561")).toBe(false);
    expect(isValidAcn("004 085 617")).toBe(false);
  });
});

describe("formatting", () => {
  it("writes an ABN and ACN the way they appear on a document", () => {
    expect(formatAbn("51824753556")).toBe("51 824 753 556");
    expect(formatAcn("004085616")).toBe("004 085 616");
  });

  it("leaves unrecognisable input alone rather than mangling it", () => {
    expect(formatAbn("not an abn")).toBe("not an abn");
  });
});

describe("validateBusinessDetails", () => {
  const base = {
    entity_type: "company",
    firm_name: "Equitable Property Pty Ltd",
    abn: GOOD_ABN,
    acn: GOOD_ACN,
    registered_address: "1 Example St, Brisbane QLD 4000",
  };

  it("accepts a complete company and normalises the numbers", () => {
    const r = validateBusinessDetails(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.abn).toBe("51 824 753 556");
      expect(r.value.acn).toBe("004 085 616");
      expect(r.value.entity_type).toBe("company");
    }
  });

  it("requires an ACN from a company — it is the identifier that survives a rename", () => {
    const r = validateBusinessDetails({ ...base, acn: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("acn");
  });

  it("does NOT require an ACN from a sole trader, who has none", () => {
    const r = validateBusinessDetails({ ...base, entity_type: "sole_trader", acn: "" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.acn).toBe("");
  });

  it("still rejects a malformed ACN when one is volunteered", () => {
    const r = validateBusinessDetails({ ...base, entity_type: "trust", acn: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe("acn");
  });

  it("names the field that failed, so the form can point at it", () => {
    for (const [patch, field] of [
      [{ entity_type: "sasquatch" }, "entity_type"],
      [{ firm_name: "   " }, "firm_name"],
      [{ abn: "" }, "abn"],
      [{ abn: "11 111 111 111" }, "abn"],
      [{ registered_address: "" }, "registered_address"],
    ] as const) {
      const r = validateBusinessDetails({ ...base, ...patch });
      expect(r.ok, JSON.stringify(patch)).toBe(false);
      if (!r.ok) expect(r.field).toBe(field);
    }
  });

  it("trims and caps rather than rejecting long input", () => {
    const r = validateBusinessDetails({ ...base, firm_name: "  " + "x".repeat(400) + "  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.firm_name.length).toBe(200);
  });
});

describe("introducerEntityColumnMissing", () => {
  it("is true for a missing column, so onboarding survives an unapplied migration", () => {
    expect(introducerEntityColumnMissing({ code: "42703" })).toBe(true);
    expect(introducerEntityColumnMissing({ code: "PGRST204" })).toBe(true);
    expect(introducerEntityColumnMissing({ message: "Could not find the 'acn' column" })).toBe(true);
  });

  it("is false for a missing TABLE — that is a different problem with a different fix", () => {
    expect(introducerEntityColumnMissing({ code: "42P01" })).toBe(false);
    expect(introducerEntityColumnMissing(null)).toBe(false);
  });
});
