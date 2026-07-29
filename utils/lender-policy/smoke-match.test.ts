import { describe, expect, it } from "vitest";
import PACK from "./pack.generated";
import { brisbaneToday, hydratePolicy } from "./index";
import { matchScenario } from "./match";
import { emptyApplicant, emptyCredit, type LenderScenario } from "./scenario";
import type { LenderPolicy } from "./types";
import type { CapacityInputs } from "../finance/capacity";
import { CURRENT_TAX_YEAR } from "../finance/tax";

/**
 * End-to-end shape check: run a realistic scenario against the whole committed
 * pack and assert the output is sane.
 *
 * This is the test that would have caught the LVR bug (every LVR check passing
 * because the estimate was capped before it was compared) on real data rather
 * than a two-lender fixture. It asserts *properties* of the run, not specific
 * lenders — which lender wins changes every time the pack is refreshed, and a
 * test that pins that would just get deleted the first time it went red.
 */

const TODAY = brisbaneToday();
const policies = PACK.map((p) =>
  hydratePolicy(p as Partial<LenderPolicy> & { id: string; name: string }),
).filter((p) => p.status === "active" || p.status === "paused");

function capacity(over: Partial<CapacityInputs> = {}): CapacityInputs {
  return {
    taxYear: CURRENT_TAX_YEAR,
    income: 110000,
    partner: 75000,
    otherIncome: 0,
    hasHecs: false,
    partnerHasHecs: false,
    claimsStandardDeduction: false,
    dependents: 1,
    declaredExpenses: 3200,
    deposit: 140000,
    state: "QLD",
    isFhb: false,
    closingCosts: 3000,
    newWeeklyRent: 0,
    newPropertyIsNewBuild: false,
    properties: [],
    creditLimit: 10000,
    personalLoan: 0,
    carLoan: 550,
    otherDebts: 0,
    consumerDebtBalance: 22000,
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
    loanAmount: 620000,
    propertyValue: 780000,
    applicants: [
      { ...emptyApplicant("Applicant 1"), monthsInCurrentRole: 36, age: 38 },
      { ...emptyApplicant("Applicant 2"), monthsInCurrentRole: 20, age: 36 },
    ],
    security: { propertyType: "house", postcode: "4051" },
    credit: emptyCredit(),
    genuineSavings: 70000,
    genuineSavingsMonthsHeld: 8,
    giftedDeposit: false,
    guarantorAvailable: false,
    loanTermYears: 30,
    interestOnly: false,
    ...over,
  };
}

describe("matching the real research pack", () => {
  it("has lenders to match against", () => {
    expect(policies.length).toBeGreaterThan(30);
  });

  it("produces a ranked run with every lender accounted for", () => {
    const run = matchScenario(policies, scenario(), TODAY);
    expect(run.matches).toHaveLength(policies.length);
    const total =
      run.summary.eligible +
      run.summary.refer +
      run.summary.ineligible +
      run.summary.insufficient_data;
    expect(total).toBe(policies.length);
    expect(run.disclaimer).toMatch(/not a credit assessment/i);
  });

  it("never claims a pass it cannot source", () => {
    const run = matchScenario(policies, scenario(), TODAY);
    for (const match of run.matches) {
      for (const check of match.checks) {
        // Every pass/fail must be backed by a real citation. An `unknown` is
        // allowed to have none — that IS the honest state.
        if (check.outcome === "pass" || check.outcome === "fail") {
          expect(check.sourceUrl, `${match.lenderId} ${check.code} has no source`).toBeTruthy();
          expect(check.asAt, `${match.lenderId} ${check.code} has no as-at date`).toBeTruthy();
        }
        expect(check.reason.length, `${match.lenderId} ${check.code}`).toBeGreaterThan(0);
      }
    }
  });

  it("finds at least one lender that fits a clean, ordinary scenario", () => {
    const run = matchScenario(policies, scenario(), TODAY);
    expect(run.summary.eligible).toBeGreaterThan(0);
  });

  it("rules lenders out when the LVR is impossible", () => {
    // 95% LVR on a $780k purchase. Plenty of lenders cap below that, so the
    // ineligible bucket must be non-empty — this is the assertion that fails
    // if the LVR check ever compares against a pre-capped figure again.
    const run = matchScenario(policies, scenario({ loanAmount: 741000 }), TODAY);
    expect(run.summary.ineligible).toBeGreaterThan(0);
    const failed = run.matches.filter((m) => m.failures.some((f) => f.code === "max_lvr"));
    expect(failed.length).toBeGreaterThan(0);
  });

  it("shrinks the eligible set when the client's credit file is impaired", () => {
    const clean = matchScenario(policies, scenario(), TODAY);
    const impaired = matchScenario(
      policies,
      scenario({
        credit: {
          ...emptyCredit(),
          defaultsCount: 2,
          defaultsTotalAmount: 8000,
          defaultsPaid: false,
          arrears12Months: 3,
        },
      }),
      TODAY,
    );
    expect(impaired.summary.eligible).toBeLessThanOrEqual(clean.summary.eligible);
  });

  it("estimates a max loan for every lender it did not rule out", () => {
    const run = matchScenario(policies, scenario({ loanAmount: null }), TODAY);
    for (const match of run.matches) {
      if (match.outcome === "ineligible") continue;
      expect(match.estimatedMaxLoan, match.lenderId).not.toBeNull();
      expect(match.estimatedMaxLoan, match.lenderId).toBeGreaterThan(0);
      // A servicing model that returns tens of millions on $185k of household
      // income has lost a decimal point somewhere.
      expect(match.estimatedMaxLoan, match.lenderId).toBeLessThan(5_000_000);
    }
  });

  it("discloses when a lender's own servicing parameters were unavailable", () => {
    const run = matchScenario(policies, scenario(), TODAY);
    const withFallbacks = run.matches.filter((m) => m.parametersUsed.fellBackTo.length > 0);
    // Most lenders do not publish an assessment buffer, so this must be common
    // — and it must be reported rather than silently absorbed.
    expect(withFallbacks.length).toBeGreaterThan(0);
  });
});
