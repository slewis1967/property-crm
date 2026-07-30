import { describe, it, expect } from "vitest";
import {
  programObligationsOutstanding,
  withoutOngoingCddColumns,
  amlColumnMissing,
  canViewConfidentialReport,
  REVIEW_CADENCE_MONTHS,
  nextReviewDate,
  isReviewDue,
  isScreeningStale,
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

/* ── Tipping off: confidential-report access ─────────────────────────────── */

describe("canViewConfidentialReport", () => {
  const base = emptyProgram();

  it("lets the lodger see their own SMR", () => {
    expect(canViewConfidentialReport("a@x.com", base, "a@x.com")).toBe(true);
  });

  it("lets the appointed compliance officer see it", () => {
    const p = { ...base, complianceOfficer: { ...base.complianceOfficer, email: "co@x.com" } };
    expect(canViewConfidentialReport("co@x.com", p, "someone@x.com")).toBe(true);
  });

  it("lets an explicitly allow-listed person see it", () => {
    const p = { ...base, smrAccess: ["auditor@x.com"] };
    expect(canViewConfidentialReport("auditor@x.com", p, "someone@x.com")).toBe(true);
  });

  it("refuses an ordinary CRM user", () => {
    expect(canViewConfidentialReport("nosy@x.com", base, "someone@x.com")).toBe(false);
  });

  it("fails CLOSED when no officer and no allow-list are configured", () => {
    // The unconfigured program is the dangerous default — it must not open up.
    expect(canViewConfidentialReport("anyone@x.com", emptyProgram(), "lodger@x.com")).toBe(false);
  });

  it("is case- and whitespace-insensitive on the viewer", () => {
    const p = { ...base, complianceOfficer: { ...base.complianceOfficer, email: "co@x.com" } };
    expect(canViewConfidentialReport("  CO@X.com ", p, null)).toBe(true);
  });

  it("refuses an empty viewer even if created_by is also empty", () => {
    expect(canViewConfidentialReport("", base, "")).toBe(false);
  });

  it("survives an allow-list stored with mixed case (hydrate lowercases it)", () => {
    const p = hydrateProgram({ smrAccess: ["Auditor@X.com"] });
    expect(canViewConfidentialReport("auditor@x.com", p, null)).toBe(true);
  });
});

/* ── Ongoing CDD ─────────────────────────────────────────────────────────── */

describe("ongoing CDD review cadence", () => {
  it("is risk-based: higher risk comes back sooner", () => {
    expect(REVIEW_CADENCE_MONTHS.high).toBeLessThan(REVIEW_CADENCE_MONTHS.medium);
    expect(REVIEW_CADENCE_MONTHS.medium).toBeLessThan(REVIEW_CADENCE_MONTHS.low);
  });

  it("computes the next review from the risk rating", () => {
    expect(nextReviewDate("high", "2026-01-15")).toBe("2026-07-15");
    expect(nextReviewDate("medium", "2026-01-15")).toBe("2027-01-15");
    expect(nextReviewDate("low", "2026-01-15")).toBe("2028-01-15");
  });

  it("treats a review as due on the day itself, not the day after", () => {
    expect(isReviewDue("2026-07-30", "2026-07-30")).toBe(true);
    expect(isReviewDue("2026-07-31", "2026-07-30")).toBe(false);
  });

  it("does not report a case with no review date as due", () => {
    expect(isReviewDue("", "2026-07-30")).toBe(false);
    expect(isReviewDue(null, "2026-07-30")).toBe(false);
  });

  it("treats a never-screened party as stale", () => {
    // The state most likely to matter — calling it fresh would defeat the check.
    expect(isScreeningStale("", "low", "2026-07-30")).toBe(true);
    expect(isScreeningStale(null, "low", "2026-07-30")).toBe(true);
  });

  it("goes stale on the risk cadence, not a fixed period", () => {
    // Screened Jan 2026: high-risk is stale by Aug, low-risk is not.
    expect(isScreeningStale("2026-01-15", "high", "2026-08-01")).toBe(true);
    expect(isScreeningStale("2026-01-15", "low", "2026-08-01")).toBe(false);
  });
});

describe("amlColumnMissing", () => {
  it("is the mirror of amlTableMissing: true for a missing COLUMN", () => {
    expect(amlColumnMissing({ code: "PGRST204" })).toBe(true);
    expect(amlColumnMissing({ code: "42703" })).toBe(true);
  });

  it("is false for a missing TABLE, which is a different problem", () => {
    expect(amlColumnMissing({ code: "42P01" })).toBe(false);
    expect(amlColumnMissing({ code: "PGRST205" })).toBe(false);
  });

  it("is false for null / unrelated errors", () => {
    expect(amlColumnMissing(null)).toBe(false);
    expect(amlColumnMissing({ code: "23505" })).toBe(false);
  });

  it("strips only the ongoing-CDD columns, leaving the rest intact", () => {
    const row = { party_name: "A", next_review_at: "2026-01-01", last_reviewed_at: "2025-01-01", data: {} };
    expect(withoutOngoingCddColumns(row)).toEqual({ party_name: "A", data: {} });
  });
});

/* ── Source of wealth (ECDD only) ────────────────────────────────────────── */

describe("source of wealth", () => {
  const complete = () => {
    const c = emptyAmlCase("individual");
    c.entity.fullLegalName = "Jane Citizen";
    c.entity.dob = "1980-01-01";
    c.entity.residentialAddress = { line1: "1 St", suburb: "Bne", state: "QLD", postcode: "4000", country: "Australia" };
    c.entity.idDocument.number = "123456";
    c.sourceOfFunds.category = "savings";
    return c;
  };

  it("is NOT required for an ordinary low-risk case", () => {
    // Demanding it universally trains people to type anything in the box.
    const c = complete();
    expect(cddCompleteness(c).complete).toBe(true);
  });

  it("IS required once enhanced due diligence applies", () => {
    const c = complete();
    c.riskFactors.pep = true;
    const r = cddCompleteness(c);
    expect(r.complete).toBe(false);
    expect(r.missing.join(" ")).toMatch(/source of wealth/i);
  });

  it("is satisfied by a description on a PEP case", () => {
    const c = complete();
    c.riskFactors.pep = true;
    c.sourceOfWealth.description = "Sale of a family business in 2019";
    expect(cddCompleteness(c).complete).toBe(true);
  });

  it("survives a stored blob that predates the field", () => {
    const old = { partyType: "individual", sourceOfFunds: { category: "savings" } };
    expect(hydrateAmlCase(old).sourceOfWealth).toEqual({ description: "", verified: false });
  });
});

/* ── Program-level obligations ───────────────────────────────────────────── */

describe("programObligationsOutstanding", () => {
  const ready = () => {
    const p = emptyProgram();
    p.enrolment.status = "enrolled";
    p.complianceOfficer.name = "A Person";
    p.programApproved.approvedAt = "2026-07-01";
    p.independentEvaluation.lastCompletedAt = "2026-07-01";
    p.independentEvaluation.nextDueAt = "2027-07-01";
    return p;
  };

  it("is silent when everything is recorded and nothing is due", () => {
    expect(programObligationsOutstanding(ready(), "2026-07-30")).toEqual([]);
  });

  it("treats a never-performed independent evaluation as outstanding", () => {
    // No evidence is not the same as satisfied.
    const p = ready();
    p.independentEvaluation.lastCompletedAt = "";
    expect(programObligationsOutstanding(p, "2026-07-30").join(" ")).toMatch(/independent evaluation/i);
  });

  it("flags an overdue independent evaluation", () => {
    const p = ready();
    p.independentEvaluation.nextDueAt = "2026-07-01";
    expect(programObligationsOutstanding(p, "2026-07-30").join(" ")).toMatch(/was due 2026-07-01/);
  });

  it("flags findings with no remediation date", () => {
    const p = ready();
    p.independentEvaluation.findings = "Screening not evidenced for 3 cases";
    expect(programObligationsOutstanding(p, "2026-07-30").join(" ")).toMatch(/remediation/i);
  });

  it("flags an overdue compliance report, but not one that is lodged", () => {
    const p = ready();
    p.complianceReport.dueAt = "2026-07-01";
    expect(programObligationsOutstanding(p, "2026-07-30").join(" ")).toMatch(/compliance report was due/i);
    p.complianceReport.lodgedAt = "2026-06-30";
    p.complianceReport.austracReference = "REF-1";
    expect(programObligationsOutstanding(p, "2026-07-30")).toEqual([]);
  });

  it("flags a report marked lodged with no AUSTRAC reference", () => {
    const p = ready();
    p.complianceReport.lodgedAt = "2026-06-30";
    expect(programObligationsOutstanding(p, "2026-07-30").join(" ")).toMatch(/no AUSTRAC reference/i);
  });

  it("flags the governance basics when the program is empty", () => {
    const out = programObligationsOutstanding(emptyProgram(), "2026-07-30");
    expect(out.join(" ")).toMatch(/enrolment/i);
    expect(out.join(" ")).toMatch(/compliance officer/i);
    expect(out.join(" ")).toMatch(/formally approved/i);
  });
});
