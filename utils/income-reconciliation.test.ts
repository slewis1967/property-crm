import { describe, it, expect } from "vitest";
import {
  atoAnnualisation,
  payslipRunRate,
  inferFrequency,
  consecutivePayslipIssue,
  stalePayslipIssue,
  reconcile,
  worstSeverity,
  type PayslipEvidence,
  type AtoEvidence,
  type DeclaredIncome,
} from "./income-reconciliation";

/**
 * The fixtures below are the real numbers from the file that motivated this
 * module (client ref NK-10010, August 2026). Every document passed the YLA
 * verification agent; the application was still assessed on the wrong income.
 * Keeping the real figures means these tests fail if we ever stop catching it.
 */

function payslip(p: Partial<PayslipEvidence>): PayslipEvidence {
  return {
    kind: "payslip",
    applicant: "Applicant 1",
    filename: "payslip.pdf",
    employer: null,
    periodStart: null,
    periodEnd: null,
    paidOn: null,
    frequency: null,
    grossThisPeriod: null,
    ytdGross: null,
    variableComponent: null,
    deductions: [],
    ...p,
  };
}

function ato(p: Partial<AtoEvidence>): AtoEvidence {
  return {
    kind: "ato",
    applicant: "Applicant 1",
    filename: "ato.pdf",
    employer: null,
    financialYear: null,
    periodStart: null,
    periodEnd: null,
    totalGross: null,
    overtime: null,
    salarySacrifice: null,
    terminationIndicated: false,
    ...p,
  };
}

function declared(p: Partial<DeclaredIncome>): DeclaredIncome {
  return {
    applicant: "Applicant 1",
    annual: null,
    employer: null,
    employmentType: null,
    basis: null,
    startedOn: null,
    otherIncomeNote: null,
    ...p,
  };
}

describe("atoAnnualisation", () => {
  it("flags a part-year statement rather than trusting the number", () => {
    // David's Redflex statement: 20/01/2026 – 26/06/2026, $25,270.29.
    const r = atoAnnualisation(
      ato({ periodStart: "2026-01-20", periodEnd: "2026-06-26", totalGross: 25_270.29 }),
    );
    expect(r.partYear).toBe(true);
    expect(r.coverageDays).toBe(158);
    // ~$58k — the figure the lender used, and the one that was wrong to rely on.
    expect(r.annual).toBeGreaterThan(56_000);
    expect(r.annual).toBeLessThan(60_000);
  });

  it("treats a full financial year as reliable", () => {
    // Melissa's Woolworths statement: a complete 2025-26.
    const r = atoAnnualisation(
      ato({ periodStart: "2025-07-01", periodEnd: "2026-06-30", totalGross: 42_263.15 }),
    );
    expect(r.partYear).toBe(false);
    expect(r.annual).toBe(42_263);
  });

  it("does not call a payroll cutoff a part year", () => {
    const r = atoAnnualisation(
      ato({ periodStart: "2025-07-01", periodEnd: "2026-06-18", totalGross: 60_000 }),
    );
    expect(r.partYear).toBe(false);
  });

  it("returns the raw figure when the document carries no period", () => {
    const r = atoAnnualisation(ato({ totalGross: 50_000 }));
    expect(r).toEqual({ annual: 50_000, partYear: false, coverageDays: null });
  });

  it("returns nulls when there is no gross", () => {
    expect(atoAnnualisation(ato({})).annual).toBeNull();
  });
});

describe("inferFrequency", () => {
  it("reads a fortnight from the period", () => {
    expect(inferFrequency(payslip({ periodStart: "2026-06-13", periodEnd: "2026-06-26" }))).toBe("fn");
  });
  it("reads a week from the period", () => {
    expect(inferFrequency(payslip({ periodStart: "2026-07-13", periodEnd: "2026-07-19" }))).toBe("wk");
  });
  it("prefers a stated frequency", () => {
    expect(inferFrequency(payslip({ frequency: "m", periodStart: "2026-07-13", periodEnd: "2026-07-19" }))).toBe("m");
  });
});

describe("payslipRunRate", () => {
  it("averages David's two fortnights rather than taking the best one", () => {
    const rate = payslipRunRate([
      payslip({ periodStart: "2026-05-16", periodEnd: "2026-05-29", grossThisPeriod: 3_645.93 }),
      payslip({ periodStart: "2026-06-13", periodEnd: "2026-06-26", grossThisPeriod: 3_122.81 }),
    ]);
    // ~$88k, against the ~$58k the ATO statement implied.
    expect(rate).toBe(87_994);
  });

  it("annualises Melissa's weekly payslips", () => {
    const rate = payslipRunRate([
      payslip({ periodStart: "2026-07-06", periodEnd: "2026-07-12", grossThisPeriod: 1_271.75 }),
      payslip({ periodStart: "2026-07-13", periodEnd: "2026-07-19", grossThisPeriod: 1_283.06 }),
    ]);
    expect(rate).toBe(66_425);
  });

  it("returns null with nothing usable", () => {
    expect(payslipRunRate([])).toBeNull();
    expect(payslipRunRate([payslip({ grossThisPeriod: 1000 })])).toBeNull();
  });
});

describe("consecutivePayslipIssue", () => {
  it("catches the missing fortnight on David's pair", () => {
    const issue = consecutivePayslipIssue([
      payslip({ periodStart: "2026-05-16", periodEnd: "2026-05-29", grossThisPeriod: 3_645.93 }),
      payslip({ periodStart: "2026-06-13", periodEnd: "2026-06-26", grossThisPeriod: 3_122.81 }),
    ]);
    expect(issue).toMatch(/not consecutive/);
  });

  it("accepts Melissa's genuinely consecutive weeks", () => {
    expect(
      consecutivePayslipIssue([
        payslip({ periodStart: "2026-07-06", periodEnd: "2026-07-12", grossThisPeriod: 1_271.75 }),
        payslip({ periodStart: "2026-07-13", periodEnd: "2026-07-19", grossThisPeriod: 1_283.06 }),
      ]),
    ).toBeNull();
  });

  it("says nothing with a single payslip", () => {
    expect(consecutivePayslipIssue([payslip({ periodStart: "2026-07-06", periodEnd: "2026-07-12" })])).toBeNull();
  });
});

describe("stalePayslipIssue", () => {
  const slips = [payslip({ periodStart: "2026-06-13", periodEnd: "2026-06-26", paidOn: "2026-07-03" })];

  it("flags payslips that have aged out", () => {
    // 19 August — seven weeks after the last pay date.
    expect(stalePayslipIssue(slips, new Date("2026-08-19"))).toMatch(/7 weeks old/);
  });

  it("stays quiet while they are current", () => {
    expect(stalePayslipIssue(slips, new Date("2026-07-20"))).toBeNull();
  });
});

describe("reconcile — the Halliday file", () => {
  const asOf = new Date("2026-08-19");

  const evidence = [
    // David
    payslip({ applicant: "David", employer: "Verra Mobility", periodStart: "2026-05-16", periodEnd: "2026-05-29", paidOn: "2026-06-05", grossThisPeriod: 3_645.93 }),
    payslip({ applicant: "David", employer: "Verra Mobility", periodStart: "2026-06-13", periodEnd: "2026-06-26", paidOn: "2026-07-03", grossThisPeriod: 3_122.81 }),
    ato({ applicant: "David", employer: "Redflex Traffic Systems", financialYear: "2025-26", periodStart: "2026-01-20", periodEnd: "2026-06-26", totalGross: 25_270.29, overtime: 5_151.64 }),
    ato({ applicant: "David", employer: "Woolworths Group Limited", financialYear: "2025-26", periodStart: "2025-07-01", periodEnd: "2026-06-30", totalGross: 61_418.71, salarySacrifice: 979.48, terminationIndicated: true }),
    // Melissa
    payslip({ applicant: "Melissa", employer: "Woolworths Group Limited", periodStart: "2026-07-06", periodEnd: "2026-07-12", paidOn: "2026-07-15", grossThisPeriod: 1_271.75 }),
    payslip({ applicant: "Melissa", employer: "Woolworths Group Limited", periodStart: "2026-07-13", periodEnd: "2026-07-19", paidOn: "2026-07-22", grossThisPeriod: 1_283.06 }),
    ato({ applicant: "Melissa", employer: "Woolworths Group Limited", financialYear: "2025-26", periodStart: "2025-07-01", periodEnd: "2026-06-30", totalGross: 42_263.15 }),
    // She started at Woolworths in November 2024, so LAST year's statement is a
    // genuine part year. It must not make this year's complete one look shaky.
    ato({ applicant: "Melissa", employer: "Woolworths Group Limited", financialYear: "2024-25", periodStart: "2024-11-28", periodEnd: "2025-06-30", totalGross: 27_911.18 }),
  ];

  const decl = [
    declared({
      applicant: "David",
      annual: 120_000,
      // What the real Needs Analysis actually holds. There is no employer name
      // field on the form, so the rep typed the WORKPLACE into the address
      // line — it does not resemble "REDFLEX TRAFFIC SYSTEMS PTY LTD" on the
      // income statement. Matching statements to employment by name would find
      // nothing here, which is why we don't.
      employer: "Police Headquarters",
      employmentType: "payg",
      basis: "casual",
      startedOn: "2026-01-24",
      otherIncomeNote: "David Casual Woolworths 1 day per $400 per week.",
    }),
    declared({ applicant: "Melissa", annual: 66_000, employer: "Woolworths Bateau Bay, 12 Bay Village Rd", employmentType: "payg", basis: "full_time" }),
  ];

  const result = reconcile({ declared: decl, evidence, asOf });

  it("does not pass the file", () => {
    expect(result.pass).toBe(false);
  });

  it("catches the overstated declaration for David", () => {
    const f = result.findings.find((x) => x.applicant === "David" && x.code === "declared_above_evidence");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
    expect(f!.message).toMatch(/\$120,000/);
  });

  it("does NOT flag Melissa, whose payslips back her declaration", () => {
    const f = result.findings.find(
      (x) => x.applicant === "Melissa" && (x.code === "declared_above_evidence" || x.code === "declared_below_evidence"),
    );
    expect(f).toBeUndefined();
  });

  it("warns that David's ATO statement is a part year", () => {
    const f = result.findings.find((x) => x.applicant === "David" && x.code === "ato_part_year");
    expect(f).toBeDefined();
    expect(f!.message).toMatch(/158 days/);
  });

  it("catches the non-consecutive payslips", () => {
    expect(result.findings.some((x) => x.applicant === "David" && x.code === "payslips_not_consecutive")).toBe(true);
  });

  it("flags David's aged payslips but not Melissa's, which are still current", () => {
    // David's last pay date is 3 July (7 weeks before asOf); Melissa's is
    // 22 July (4 weeks). Only one of them has gone stale.
    const stale = result.findings.filter((x) => x.code === "payslips_stale");
    expect(stale.map((f) => f.applicant)).toEqual(["David"]);
  });

  it("catches the Woolworths income claimed against a job that ended", () => {
    const f = result.findings.find((x) => x.applicant === "David" && x.code === "employment_ended");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("critical");
  });

  it("prefers payslips over the part-year ATO figure for the household total", () => {
    // ~$154k on payslips, not the ~$101k the statements imply.
    expect(result.bestEvidenceTotal).toBe(87_994 + 66_425);
    expect(result.declaredTotal).toBe(186_000);
  });

  it("reports David's ATO view separately so the disagreement is visible", () => {
    const david = result.applicants.find((a) => a.applicant === "David")!;
    expect(david.atoIsPartYear).toBe(true);
    expect(david.payslipAnnual).toBe(87_994);
    expect(david.declaredAnnual).toBe(120_000);
  });

  it("still produces an ATO figure when the employer names don't match", () => {
    // The regression: matching statements to employment by name found nothing,
    // so the panel showed a dash where the ~$58k the lender serviced on should
    // have been, and the part-year warning never fired.
    const david = result.applicants.find((a) => a.applicant === "David")!;
    expect(david.atoAnnual).toBeGreaterThan(56_000);
    expect(david.atoAnnual).toBeLessThan(60_000);
  });

  it("leaves the ended job out of the ATO figure rather than adding both", () => {
    // David's Woolworths statement is a full year at $61k, but that employment
    // terminated — counting it would imply a household income nobody has.
    const david = result.applicants.find((a) => a.applicant === "David")!;
    expect(david.atoAnnual).toBeLessThan(61_418);
  });

  it("gives Melissa her full-year ATO figure", () => {
    const mel = result.applicants.find((a) => a.applicant === "Melissa")!;
    expect(mel.atoAnnual).toBe(42_263);
  });

  it("doesn't call Melissa's figure part-year because LAST year's was", () => {
    // Her 2024-25 statement is a real part year — she started that November —
    // but her figure comes from a complete 2025-26. Marking it unreliable
    // would tell the reader the opposite of the truth.
    const mel = result.applicants.find((a) => a.applicant === "Melissa")!;
    expect(mel.atoIsPartYear).toBe(false);
    expect(result.findings.some((f) => f.applicant === "Melissa" && f.code === "ato_part_year")).toBe(false);
  });

  it("summarises both totals", () => {
    expect(result.summary).toMatch(/\$186,000/);
    expect(result.summary).toMatch(/\$154,419/);
  });
});

describe("reconcile — clean file", () => {
  it("passes when declaration and payslips agree", () => {
    const r = reconcile({
      asOf: new Date("2026-07-25"),
      declared: [declared({ applicant: "A", annual: 66_000, employer: "Woolworths" })],
      evidence: [
        payslip({ applicant: "A", employer: "Woolworths", periodStart: "2026-07-06", periodEnd: "2026-07-12", paidOn: "2026-07-15", grossThisPeriod: 1_271.75 }),
        payslip({ applicant: "A", employer: "Woolworths", periodStart: "2026-07-13", periodEnd: "2026-07-19", paidOn: "2026-07-22", grossThisPeriod: 1_283.06 }),
      ],
    });
    expect(r.pass).toBe(true);
    expect(r.findings).toEqual([]);
    expect(r.summary).toMatch(/reconciles/);
  });

  it("flags a declaration with nothing behind it at all", () => {
    const r = reconcile({
      asOf: new Date("2026-07-25"),
      declared: [declared({ applicant: "A", annual: 90_000 })],
      evidence: [],
    });
    expect(r.pass).toBe(false);
    expect(r.findings[0]!.code).toBe("income_unevidenced");
  });
});

describe("worstSeverity", () => {
  it("returns null for no findings", () => {
    expect(worstSeverity([])).toBeNull();
  });
  it("picks critical over warn", () => {
    expect(
      worstSeverity([
        { applicant: "A", severity: "warn", code: "x", message: "", action: null },
        { applicant: "A", severity: "critical", code: "y", message: "", action: null },
      ]),
    ).toBe("critical");
  });
});
