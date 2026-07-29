import { describe, expect, it } from "vitest";
import { matchLender, matchScenario, servicingParams, applyLenderParams } from "./match";
import { hydratePolicy } from "./index";
import { emptyApplicant, emptyCredit, type LenderScenario } from "./scenario";
import type { Fact, LenderPolicy } from "./types";
import type { CapacityInputs } from "../finance/capacity";
import { CURRENT_TAX_YEAR } from "../finance/tax";

const TODAY = "2026-07-29";

function fact<T>(value: T, over: Partial<Fact<T>> = {}): Fact<T> {
  return {
    value,
    asAt: "2026-06-01",
    sourceUrl: "https://broker.example.com.au/policy/page",
    confidence: "high",
    status: "verified",
    ...over,
  };
}

function capacity(over: Partial<CapacityInputs> = {}): CapacityInputs {
  return {
    taxYear: CURRENT_TAX_YEAR,
    income: 120000,
    partner: 0,
    otherIncome: 0,
    hasHecs: false,
    partnerHasHecs: false,
    claimsStandardDeduction: false,
    dependents: 0,
    declaredExpenses: 2500,
    deposit: 150000,
    state: "QLD",
    isFhb: false,
    closingCosts: 3000,
    newWeeklyRent: 0,
    newPropertyIsNewBuild: false,
    properties: [],
    creditLimit: 0,
    personalLoan: 0,
    carLoan: 0,
    otherDebts: 0,
    consumerDebtBalance: 0,
    rate: 6,
    buffer: 3,
    loanTerm: 30,
    rentShading: 0.8,
    dtiCap: 6,
    negativeGearing: false,
    ...over,
  };
}

function scenario(over: Partial<LenderScenario> = {}): LenderScenario {
  return {
    capacity: capacity(),
    purpose: "purchase_owner_occupied",
    loanAmount: 600000,
    propertyValue: 750000,
    applicants: [{ ...emptyApplicant(), monthsInCurrentRole: 24, age: 35 }],
    security: { propertyType: "house", postcode: "4000" },
    credit: emptyCredit(),
    genuineSavings: 60000,
    genuineSavingsMonthsHeld: 6,
    giftedDeposit: false,
    guarantorAvailable: false,
    loanTermYears: 30,
    interestOnly: false,
    ...over,
  };
}

function policy(over: Record<string, unknown> = {}): LenderPolicy {
  return hydratePolicy({
    id: "example",
    name: "Example Bank",
    tier: "major_bank",
    ...over,
  } as Partial<LenderPolicy> & { id: string; name: string });
}

describe("servicingParams", () => {
  it("takes verified values and reports the rest as fallbacks", () => {
    const p = servicingParams(
      policy({
        servicing: {
          assessmentBufferPct: fact(3),
          dtiCap: fact(6, { sourceUrl: null }), // unverified → not used
        },
      }),
      TODAY,
    );
    expect(p.buffer).toBe(3);
    expect(p.dtiCap).toBeNull();
    expect(p.fellBackTo).toContain("servicing.dtiCap");
    expect(p.fellBackTo).not.toContain("servicing.assessmentBufferPct");
  });
});

describe("applyLenderParams", () => {
  it("overlays only what the lender actually publishes", () => {
    const base = capacity();
    const out = applyLenderParams(base, {
      buffer: 2,
      floorRate: 8,
      rentShading: null,
      dtiCap: null,
      creditCardRate: 0.03,
      hemLoading: null,
      fellBackTo: [],
    });
    expect(out.buffer).toBe(2);
    expect(out.assessmentFloorRate).toBe(8);
    expect(out.creditCardAssessmentRate).toBe(0.03);
    expect(out.rentShading).toBe(base.rentShading);
    expect(out.dtiCap).toBe(base.dtiCap);
  });
});

describe("the unknown-not-pass rule", () => {
  it("never reports an unresearched lender as eligible", () => {
    const m = matchLender(policy(), scenario(), TODAY);
    expect(m.outcome).toBe("insufficient_data");
    expect(m.checks.every((c) => c.outcome !== "pass")).toBe(true);
  });

  it("returns unknown — not pass — when the only fact fails verification", () => {
    const m = matchLender(
      policy({ lvr: { maxLvrOwnerOccupiedPct: fact(95, { sourceUrl: null }) } }),
      scenario(),
      TODAY,
    );
    const lvr = m.checks.find((c) => c.code === "max_lvr");
    expect(lvr?.outcome).toBe("unknown");
  });

  it("returns unknown when the SCENARIO lacks the input, not a pass", () => {
    const m = matchLender(
      policy({ lvr: { maxLvrOwnerOccupiedPct: fact(95) } }),
      scenario({ loanAmount: null, propertyValue: null, capacity: capacity({ income: 0, partner: 0 }) }),
      TODAY,
    );
    const lvr = m.checks.find((c) => c.code === "max_lvr");
    expect(lvr?.outcome).toBe("unknown");
  });
});

describe("knock-outs", () => {
  it("fails an LVR over the published maximum and cites the source", () => {
    const m = matchLender(
      policy({ lvr: { maxLvrOwnerOccupiedPct: fact(70) } }),
      scenario(), // 600k / 750k = 80%
      TODAY,
    );
    expect(m.outcome).toBe("ineligible");
    const lvr = m.failures.find((c) => c.code === "max_lvr");
    expect(lvr?.reason).toContain("80%");
    expect(lvr?.sourceUrl).toBe("https://broker.example.com.au/policy/page");
    expect(lvr?.asAt).toBe("2026-06-01");
  });

  it("fails a loan under the lender's minimum", () => {
    const m = matchLender(
      policy({ product: { minLoanAmount: fact(400000) } }),
      scenario({ loanAmount: 250000, propertyValue: 400000 }),
      TODAY,
    );
    expect(m.failures.some((c) => c.code === "min_loan")).toBe(true);
  });

  it("ignores an implausible minimum rather than acting on it", () => {
    // $750k is outside the plausible range for a MINIMUM loan — a misread, not
    // a policy. It must not knock the client out.
    const m = matchLender(
      policy({ product: { minLoanAmount: fact(750000) } }),
      scenario(),
      TODAY,
    );
    expect(m.checks.find((c) => c.code === "min_loan")?.outcome).toBe("unknown");
  });

  it("fails a unit under the minimum internal area", () => {
    const m = matchLender(
      policy({ security: { minUnitFloorAreaSqm: fact(50) } }),
      scenario({ security: { propertyType: "unit_apartment", floorAreaSqm: 38 } }),
      TODAY,
    );
    const check = m.failures.find((c) => c.code === "unit_size");
    expect(check?.reason).toContain("38m²");
  });

  it("fails an applicant on probation where probation is declined", () => {
    const m = matchLender(
      policy({ employment: { probationAccepted: fact(false) } }),
      scenario({
        applicants: [{ ...emptyApplicant(), employmentBasis: "probation", monthsInCurrentRole: 2 }],
      }),
      TODAY,
    );
    expect(m.failures.some((c) => c.code === "probation")).toBe(true);
  });

  it("fails an income type the lender does not accept", () => {
    const m = matchLender(
      policy({
        income: {
          rules: fact([{ type: "payg_casual", accepted: false, conditions: "Casual income not assessed." }]),
        },
      }),
      scenario({
        applicants: [
          { ...emptyApplicant(), employmentBasis: "casual", monthsInCurrentRole: 18, incomeTypes: ["payg_casual"] },
        ],
      }),
      TODAY,
    );
    expect(m.failures.some((c) => c.code === "income_type")).toBe(true);
  });
});

describe("refer, not fail", () => {
  it("refers a short tenure that has same-industry continuity behind it", () => {
    const m = matchLender(
      policy({ employment: { minMonthsCurrentJob: fact(6) } }),
      scenario({
        applicants: [{ ...emptyApplicant(), monthsInCurrentRole: 2, monthsInIndustry: 48 }],
      }),
      TODAY,
    );
    const check = m.checks.find((c) => c.code === "employment_tenure");
    expect(check?.outcome).toBe("refer");
    expect(m.outcome).toBe("refer");
  });

  it("fails the same short tenure with no industry history", () => {
    const m = matchLender(
      policy({ employment: { minMonthsCurrentJob: fact(6) } }),
      scenario({
        applicants: [{ ...emptyApplicant(), monthsInCurrentRole: 2, monthsInIndustry: 0 }],
      }),
      TODAY,
    );
    expect(m.checks.find((c) => c.code === "employment_tenure")?.outcome).toBe("fail");
  });

  it("disregards defaults under the lender's published threshold", () => {
    const m = matchLender(
      policy({ credit: { defaultIgnoredUnderAmount: fact(1000) } }),
      scenario({ credit: { ...emptyCredit(), defaultsCount: 1, defaultsTotalAmount: 300 } }),
      TODAY,
    );
    expect(m.checks.find((c) => c.code === "credit_defaults")?.outcome).toBe("pass");
  });
});

describe("estimated max loan", () => {
  it("uses the lender's own buffer — a tighter buffer lends less", () => {
    const tight = matchLender(
      policy({ servicing: { assessmentBufferPct: fact(4) }, lvr: { maxLvrOwnerOccupiedPct: fact(95) } }),
      scenario({ loanAmount: null }),
      TODAY,
    );
    const loose = matchLender(
      policy({ servicing: { assessmentBufferPct: fact(1) }, lvr: { maxLvrOwnerOccupiedPct: fact(95) } }),
      scenario({ loanAmount: null }),
      TODAY,
    );
    expect(loose.estimatedMaxLoan).toBeGreaterThan(tight.estimatedMaxLoan ?? 0);
  });

  it("caps by the lender's published maximum loan and says so", () => {
    const m = matchLender(
      policy({
        servicing: { assessmentBufferPct: fact(1) },
        product: { maxLoanAmount: fact(300000) },
      }),
      scenario({ loanAmount: null, propertyValue: null }),
      TODAY,
    );
    expect(m.estimatedMaxLoan).toBeLessThanOrEqual(300000);
    expect(m.bindingConstraint).toBe("lender maximum");
  });

  it("caps by the maximum LVR against the property value", () => {
    const m = matchLender(
      policy({
        servicing: { assessmentBufferPct: fact(1) },
        lvr: { maxLvrOwnerOccupiedPct: fact(80) },
      }),
      scenario({ loanAmount: null, propertyValue: 500000 }),
      TODAY,
    );
    expect(m.estimatedMaxLoan).toBeLessThanOrEqual(400000);
  });
});

describe("ranking", () => {
  it("puts eligible lenders above refer, above insufficient data, above ineligible", () => {
    const eligible = policy({
      id: "eligible",
      name: "Eligible Bank",
      lvr: { maxLvrOwnerOccupiedPct: fact(95) },
      product: { minLoanAmount: fact(50000), maxLoanAmount: fact(2000000), maxLoanTermYears: fact(30) },
    });
    const ineligible = policy({
      id: "ineligible",
      name: "Ineligible Bank",
      lvr: { maxLvrOwnerOccupiedPct: fact(60) },
    });
    const unknown = policy({ id: "unknown", name: "Unknown Bank" });

    const run = matchScenario([ineligible, unknown, eligible], scenario(), TODAY);
    expect(run.matches.map((m) => m.lenderId)).toEqual(["eligible", "unknown", "ineligible"]);
    expect(run.summary.eligible).toBe(1);
    expect(run.summary.ineligible).toBe(1);
    expect(run.summary.insufficient_data).toBe(1);
    expect(run.disclaimer).toMatch(/not a credit assessment/i);
  });

  it("breaks a tie toward the better-evidenced record", () => {
    const common = {
      lvr: { maxLvrOwnerOccupiedPct: fact(95) },
      product: { minLoanAmount: fact(50000), maxLoanTermYears: fact(30) },
    };
    const thin = policy({ id: "thin", name: "Thin Bank", ...common });
    const rich = policy({
      id: "rich",
      name: "Rich Bank",
      ...common,
      // Same servicing outcome, but more of the record survives verification.
      security: { ruralResidentialAccepted: fact(true), companyTitleAccepted: fact(true) },
      credit: { paidDefaultsAccepted: fact(true), judgmentsAccepted: fact(true) },
    });
    const run = matchScenario([thin, rich], scenario(), TODAY);
    expect(run.matches[0].lenderId).toBe("rich");
    // Both records are 100% verified, so the RATIO ties — it's the volume of
    // verified facts that has to break it.
    expect(run.matches[0].dataQuality).toBe(run.matches[1].dataQuality);
    expect(run.matches[0].verifiedFieldCount).toBeGreaterThan(run.matches[1].verifiedFieldCount);
  });
});
