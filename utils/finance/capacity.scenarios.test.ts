import { describe, expect, it } from "vitest";
import {
  computeCapacity,
  emptyProperty,
  type CapacityInputs,
  type ExistingProperty,
} from "./capacity";

/**
 * GOLDEN-MASTER scenarios for the borrowing-capacity engine.
 *
 * `capacity.test.ts` proves the engine's *mechanisms* in isolation. This file
 * pins the *end-to-end assessed numbers* for named real-world borrower shapes,
 * so a future refactor cannot silently move what a given borrower is told they
 * can borrow. Each pinned figure is paired with a documented-direction
 * assertion (from the CLAUDE.md "Borrowing capacity engine" spec) so the test
 * guards intent, not just an arbitrary snapshot.
 *
 * The exact-dollar pins use `Math.round(maxLoan)` compared with `===`: the
 * engine is deterministic, so any drift is a real behavioural change to triage.
 * Where a figure is derivable from the spec by hand (DTI ceiling, HEM, HELP
 * repayment) the derivation is shown in a comment.
 */

const base: CapacityInputs = {
  taxYear: "2026-27",
  income: 120000,
  partner: 0,
  otherIncome: 0,
  hasHecs: false,
  partnerHasHecs: false,
  claimsStandardDeduction: true,
  dependents: 0,
  declaredExpenses: 0,
  deposit: 0,
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
  rate: 6.5,
  buffer: 3,
  loanTerm: 30,
  rentShading: 0.8,
  dtiCap: 6,
  negativeGearing: true,
};

const investment = (over: Partial<ExistingProperty> = {}): ExistingProperty => ({
  ...emptyProperty("p1"),
  use: "investment",
  value: 600000,
  loanBalance: 400000,
  rate: 6.5,
  termRemaining: 25,
  weeklyRent: 550,
  autoCosts: true,
  ...over,
});

// A geared existing investment: $700k debt, $750k value, $450/wk — the negative
// cash-flow shape used across the negative-gearing scenarios.
const gearedIp = investment({ loanBalance: 700000, value: 750000, weeklyRent: 450 });

// Lift the DTI cap so servicing (not the 6× ceiling) binds — otherwise the
// negative-gearing tax effect is masked by a flat DTI cap.
const servicingBound = { ...base, dtiCap: 9 };

describe("scenario: Kim Ho — high income, DTI-bound", () => {
  // Dual high income ($400k + $300k) at a cheap 3% rate: servicing would allow
  // far more than 6× income, so the DTI ceiling is what binds.
  const kim = computeCapacity({ ...base, income: 400000, partner: 300000, rate: 3 });

  it("the DTI ceiling binds, not servicing", () => {
    expect(kim.bindingConstraint).toBe("dti");
    expect(kim.maxLoanByServicing).toBeGreaterThan(kim.maxLoanByDti);
    expect(kim.maxLoan).toBe(kim.maxLoanByDti);
  });

  it("assessed max borrow = 6 × $700k gross income = $4.2m", () => {
    // maxLoanByDti = dtiCap × dtiIncome − existingDebt = 6 × 700,000 − 0
    expect(kim.maxLoanByDti).toBe(4200000);
    expect(Math.round(kim.maxLoan)).toBe(4200000);
    expect(kim.dtiAtMax).toBeCloseTo(6, 6);
    expect(kim.converged).toBe(true);
  });
});

describe("scenario: owner-occupier — servicing-bound", () => {
  // Single $120k PAYG, no debts, buying a home (no rental income): the surplus
  // capitalised at the stressed rate is what limits the loan.
  const oo = computeCapacity(base);

  it("servicing binds, well under the DTI ceiling", () => {
    expect(oo.bindingConstraint).toBe("servicing");
    expect(oo.maxLoanByServicing).toBeLessThan(oo.maxLoanByDti);
    expect(oo.maxLoan).toBe(oo.maxLoanByServicing);
  });

  it("assessed max borrow is pinned at $682,243", () => {
    expect(Math.round(oo.maxLoan)).toBe(682243);
    // Sanity band shared with capacity.test.ts's baseline.
    expect(oo.maxLoan).toBeGreaterThan(300000);
    expect(oo.maxLoan).toBeLessThan(800000);
    expect(oo.surplus).toBeGreaterThan(0);
    expect(oo.converged).toBe(true);
  });
});

describe("scenario: investor with a negatively geared property — tax-year reform", () => {
  // Same established property bought AFTER the 12 May 2026 cutoff (not
  // grandfathered, not a new build). Assessed in 2026-27 (NG allowed) vs
  // 2027-28 (NG limited to new builds → this loss is disallowed).
  const boughtAfter = { ...gearedIp, heldBeforeNgCutoff: false, isNewBuild: false };
  const y2627 = computeCapacity({ ...servicingBound, properties: [boughtAfter] });
  const y2728 = computeCapacity({
    ...servicingBound,
    taxYear: "2027-28",
    properties: [boughtAfter],
  });
  // Same property but GRANDFATHERED (held at the cutoff) — keeps the deduction
  // in 2027-28.
  const grandfathered = computeCapacity({
    ...servicingBound,
    taxYear: "2027-28",
    properties: [{ ...gearedIp, heldBeforeNgCutoff: true, isNewBuild: false }],
  });

  it("2026-27: the rental loss is deductible and lifts capacity", () => {
    expect(y2627.deductibleLoss).toBeCloseTo(28850, 0);
    expect(y2627.disallowedLoss).toBe(0);
    expect(y2627.negativeGearingBenefitMonthly).toBeCloseTo(769.3333, 3);
    expect(Math.round(y2627.maxLoan)).toBe(231922);
    expect(y2627.bindingConstraint).toBe("servicing");
  });

  it("2027-28: the SAME loss is disallowed → the number drops", () => {
    expect(y2728.deductibleLoss).toBe(0);
    expect(y2728.disallowedLoss).toBeCloseTo(28850, 0);
    expect(y2728.negativeGearingBenefitMonthly).toBe(0);
    expect(Math.round(y2728.maxLoan)).toBe(143083);
    // Documented direction: losing the deduction cuts assessed capacity.
    expect(y2728.maxLoan).toBeLessThan(y2627.maxLoan);
  });

  it("2027-28 grandfathered: the deduction survives and beats the disallowed case", () => {
    expect(grandfathered.deductibleLoss).toBeCloseTo(28850, 0);
    expect(grandfathered.disallowedLoss).toBe(0);
    expect(Math.round(grandfathered.maxLoan)).toBe(234578);
    expect(grandfathered.maxLoan).toBeGreaterThan(y2728.maxLoan);
  });
});

describe("scenario: borrower with HECS", () => {
  const noHecs = computeCapacity(base);
  const withHecs = computeCapacity({ ...base, hasHecs: true });
  // Same HECS borrower, now also holding the geared investment.
  const hecsPlusIp = computeCapacity({ ...base, hasHecs: true, properties: [gearedIp] });

  it("the HELP debt reduces assessed capacity", () => {
    expect(withHecs.maxLoan).toBeLessThan(noHecs.maxLoan);
    expect(Math.round(withHecs.maxLoan)).toBe(608698);
  });

  it("the compulsory repayment is derived from repayment income, not the raw wage", () => {
    // taxable = 120,000 − 1,000 std deduction = 119,000 (no rental loss here).
    // 119,000 is in the 15c band (free 69,528 → band15Upper 129,717):
    // (119,000 − 69,528) × 0.15 = 7,420.80
    expect(withHecs.applicantTax.taxableIncome).toBe(119000);
    expect(withHecs.applicantTax.hecs).toBeCloseTo(7420.8, 4);
  });

  it("the rental-loss add-back keeps HELP income undiscounted", () => {
    // The loss reduces income-tax taxable income (119,000 → 90,150) …
    expect(hecsPlusIp.deductibleLoss).toBeCloseTo(28850, 0);
    expect(hecsPlusIp.applicantTax.taxableIncome).toBeCloseTo(90150, 0);
    // … but is ADDED BACK for HELP, so the repayment is identical to the
    // no-loss case: 90,150 + 28,850 = 119,000 → same $7,420.80.
    expect(hecsPlusIp.applicantTax.hecs).toBeCloseTo(7420.8, 4);
    expect(hecsPlusIp.applicantTax.hecs).toBeCloseTo(withHecs.applicantTax.hecs, 4);
  });
});

describe("scenario: living expenses — HEM floor vs higher-of-declared", () => {
  // Single $120k → gross household $120k → HEM 'mid' tier, 1 adult, 0 kids = $1,880/mo.
  const underDeclared = computeCapacity({ ...base, declaredExpenses: 200 });
  const overDeclared = computeCapacity({ ...base, declaredExpenses: 5000 });

  it("floors below-HEM declared expenses at the HEM benchmark", () => {
    expect(underDeclared.hem).toBe(1880);
    expect(underDeclared.livingExp).toBe(1880); // $200 declared is ignored — HEM used
    expect(Math.round(underDeclared.maxLoan)).toBe(682243);
  });

  it("uses declared expenses when they exceed HEM (higher-of), cutting capacity", () => {
    expect(overDeclared.hem).toBe(1880);
    expect(overDeclared.livingExp).toBe(5000); // declared > HEM → declared used
    expect(overDeclared.maxLoan).toBeLessThan(underDeclared.maxLoan);
    expect(Math.round(overDeclared.maxLoan)).toBe(311191);
  });
});
