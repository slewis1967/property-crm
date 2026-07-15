import { describe, it, expect } from "vitest";
import {
  emptyAmlCase,
  hydrateAmlCase,
  partySummary,
  cddCompleteness,
  deriveRiskRating,
  needsEnhancedDd,
  screeningSubjects,
  addBusinessDays,
  addCalendarDays,
  reportDueDate,
  daysUntil,
  retentionUntil,
  officerNotifyDue,
  emptyProgram,
  hydrateProgram,
  amlTableMissing,
  amlErrMessage,
  reportTypeMeta,
} from "./aml";

describe("hydrateAmlCase", () => {
  it("fills a blank template from an empty/garbage blob", () => {
    expect(hydrateAmlCase(null)).toEqual(emptyAmlCase("individual"));
    expect(hydrateAmlCase("nonsense").partyType).toBe("individual");
  });

  it("preserves a stored party type and merges partial entity data", () => {
    const stored = { partyType: "company", entity: { companyName: "Acme Pty Ltd" } };
    const h = hydrateAmlCase(stored);
    expect(h.partyType).toBe("company");
    expect(h.entity.companyName).toBe("Acme Pty Ltd");
    // Missing nested objects are still filled with defaults.
    expect(h.entity.residentialAddress.country).toBe("Australia");
    expect(h.beneficialOwners).toEqual([]);
  });

  it("drops unknown screening list codes but keeps valid ones", () => {
    const h = hydrateAmlCase({ screening: { lists: ["DFAT", "NOPE", "PEP"] } });
    expect(h.screening.lists).toEqual(["DFAT", "PEP"]);
  });
});

describe("partySummary", () => {
  it("labels each entity type from its name field", () => {
    const c = emptyAmlCase("company");
    c.entity.companyName = "Acme Pty Ltd";
    expect(partySummary(c)).toBe("Acme Pty Ltd");
    const t = emptyAmlCase("trust");
    t.entity.trustName = "Smith Family Trust";
    expect(partySummary(t)).toBe("Smith Family Trust");
    const i = emptyAmlCase("individual");
    i.entity.fullLegalName = "Jane Smith";
    expect(partySummary(i)).toBe("Jane Smith");
  });
});

describe("cddCompleteness", () => {
  it("flags missing individual identity + source of funds", () => {
    const { complete, missing } = cddCompleteness(emptyAmlCase("individual"));
    expect(complete).toBe(false);
    expect(missing).toContain("Full legal name");
    expect(missing).toContain("Identity document");
    expect(missing).toContain("Source of funds");
  });

  it("is complete once an individual has identity + source of funds", () => {
    const c = emptyAmlCase("individual");
    c.entity.fullLegalName = "Jane Smith";
    c.entity.dob = "1990-01-01";
    c.entity.residentialAddress = { line1: "1 St", suburb: "Sydney", state: "NSW", postcode: "2000", country: "Australia" };
    c.entity.idDocument.number = "N1234567";
    c.sourceOfFunds.category = "savings";
    expect(cddCompleteness(c).complete).toBe(true);
  });

  it("requires a beneficial owner for a company", () => {
    const c = emptyAmlCase("company");
    c.entity.companyName = "Acme Pty Ltd";
    c.entity.acnAbn = "123456789";
    c.entity.registeredOffice = { line1: "1 St", suburb: "Sydney", state: "NSW", postcode: "2000", country: "Australia" };
    c.sourceOfFunds.category = "business_income";
    expect(cddCompleteness(c).missing).toContain("At least one beneficial owner / controller");
    c.beneficialOwners.push({ fullLegalName: "Jane Smith", dob: "", ownershipPercent: 100, role: "Director", verified: false });
    expect(cddCompleteness(c).complete).toBe(true);
  });
});

describe("deriveRiskRating / needsEnhancedDd", () => {
  it("rates a clean individual low", () => {
    expect(deriveRiskRating(emptyAmlCase("individual"))).toBe("low");
    expect(needsEnhancedDd(emptyAmlCase("individual"))).toBe(false);
  });

  it("escalates a PEP to high and requires enhanced DD", () => {
    const c = emptyAmlCase("individual");
    c.riskFactors.pep = true;
    expect(deriveRiskRating(c)).toBe("high");
    expect(needsEnhancedDd(c)).toBe(true);
  });

  it("treats a confirmed screening match as high risk", () => {
    const c = emptyAmlCase("individual");
    c.screening.status = "confirmed_match";
    expect(deriveRiskRating(c)).toBe("high");
    expect(needsEnhancedDd(c)).toBe(true);
  });

  it("rates a plain company medium (baseline for a non-individual)", () => {
    expect(deriveRiskRating(emptyAmlCase("company"))).toBe("medium");
  });
});

describe("screeningSubjects", () => {
  it("returns the party and each named beneficial owner", () => {
    const c = emptyAmlCase("company");
    c.entity.companyName = "Acme Pty Ltd";
    c.entity.fullLegalName = "Authorised Person";
    c.beneficialOwners.push({ fullLegalName: "Jane Smith", dob: "", ownershipPercent: 30, role: "Director", verified: false });
    const names = screeningSubjects(c).map((s) => s.name);
    expect(names).toContain("Acme Pty Ltd");
    expect(names).toContain("Jane Smith");
  });

  it("omits an unnamed party", () => {
    expect(screeningSubjects(emptyAmlCase("individual"))).toEqual([]);
  });
});

describe("business-day + deadline math", () => {
  it("skips the weekend when adding business days", () => {
    // 2026-07-15 is a Wednesday. +3 business days = Mon 2026-07-20.
    expect(addBusinessDays("2026-07-15", 3)).toBe("2026-07-20");
  });

  it("adds calendar days for the terrorism SMR deadline", () => {
    expect(addCalendarDays("2026-07-18", 1)).toBe("2026-07-19"); // across a weekend
  });

  it("computes each report's statutory due date", () => {
    expect(reportDueDate("SMR", "2026-07-15")).toBe("2026-07-20"); // 3 business days
    expect(reportDueDate("SMR", "2026-07-15", true)).toBe("2026-07-16"); // 24h ⇒ next day
    expect(reportDueDate("TTR", "2026-07-15")).toBe("2026-07-29"); // 10 business days
    expect(reportDueDate("IFTI", "2026-07-15")).toBe("2026-07-29");
  });

  it("reports negative daysUntil for an overdue date", () => {
    expect(daysUntil("2026-07-10", new Date("2026-07-15T00:00:00Z"))).toBe(-5);
  });

  it("retains records for 7 years", () => {
    expect(retentionUntil("2026-07-15")).toBe("2033-07-15");
  });
});

describe("program", () => {
  it("hydrates a blank program and computes the 14-day officer-notify deadline", () => {
    const p = hydrateProgram(null);
    expect(p).toEqual(emptyProgram());
    expect(officerNotifyDue(p)).toBe("");
    p.enrolment.enrolledAt = "2026-07-15";
    expect(officerNotifyDue(p)).toBe("2026-07-29");
  });
});

describe("error / migration helpers", () => {
  it("treats missing-table codes as table-missing, not missing-column", () => {
    expect(amlTableMissing({ code: "42P01" })).toBe(true);
    expect(amlTableMissing({ code: "PGRST205" })).toBe(true);
    expect(amlTableMissing({ code: "42703" })).toBe(false); // missing column
    expect(amlTableMissing({ code: "PGRST204" })).toBe(false);
    expect(amlTableMissing(null)).toBe(false);
  });

  it("extracts a human message", () => {
    expect(amlErrMessage(new Error("boom"), "fb")).toBe("boom");
    expect(amlErrMessage({ hint: "try this" }, "fb")).toBe("try this");
    expect(amlErrMessage({}, "fb")).toBe("fb");
  });

  it("exposes report metadata", () => {
    expect(reportTypeMeta("TTR").deadlineBusinessDays).toBe(10);
    expect(() => reportTypeMeta("XXX" as never)).toThrow();
  });
});
