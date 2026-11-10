import { describe, expect, it } from "vitest";
import {
  computeCapacity,
  emptyProperty,
  CREDIT_CARD_ASSESSMENT_RATE,
  type CapacityInputs,
  type ExistingProperty,
} from "./capacity";
import { loanFromMonthly } from "./tax";
import { capacityLevers, CAPACITY_LEVER_DISCLAIMER } from "./capacityLevers";

// Same shape the engine's own test file uses.
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
  value: 1_800_000,
  loanBalance: 1_686_000,
  rate: 6.5,
  termRemaining: 25,
  weeklyRent: 1500,
  autoCosts: true,
  ...over,
});

// Concatenate a lever's text so `toContain` checks title + impact + note.
const text = (l?: { title: string; impact: string; note?: string }) =>
  l ? `${l.title} ${l.impact} ${l.note ?? ""}` : "";
const allText = (levers: { title: string; impact: string; note?: string }[]) =>
  levers.map(text).join(" ");
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const round1000 = (n: number) => Math.round(n / 1000) * 1000;
const round5 = (n: number) => Math.round(n / 5) * 5;

describe("capacityLevers — DTI-bound (over the cap)", () => {
  // A heavily geared portfolio pushes existing debt past the DTI ceiling.
  const inputs: CapacityInputs = { ...base, income: 95_000, properties: [investment()] };
  const result = computeCapacity(inputs);

  it("is genuinely DTI-bound and over the cap", () => {
    expect(result.maxLoanByDti).toBe(0);
    expect(result.maxLoanByDti).toBeLessThanOrEqual(result.maxLoanByServicing);
  });

  it("returns a 'reduce existing debt' lever with the correct over-by amount", () => {
    const levers = capacityLevers(inputs, result);
    const existingDebt =
      result.portfolioDebt +
      Math.max(0, inputs.creditLimit) +
      Math.max(0, inputs.consumerDebtBalance);
    const overBy = -(inputs.dtiCap * result.dtiIncome - existingDebt);
    expect(overBy).toBeGreaterThan(0);

    const lever = levers.find((l) => /reduce existing debt/i.test(l.title));
    expect(lever).toBeDefined();
    expect(text(lever)).toContain(money(round1000(overBy)));
    // And the servicing-ceiling target in the note.
    expect(text(lever)).toContain(money(round1000(overBy + result.maxLoanByServicing)));
  });

  it("returns a rent/income lever with the correct weekly figure to clear the cap", () => {
    const levers = capacityLevers(inputs, result);
    const existingDebt =
      result.portfolioDebt +
      Math.max(0, inputs.creditLimit) +
      Math.max(0, inputs.consumerDebtBalance);
    const overBy = -(inputs.dtiCap * result.dtiIncome - existingDebt);
    const weekly = round5(overBy / inputs.dtiCap / 52);

    const lever = levers.find((l) => /increase assessable income or rent/i.test(l.title));
    expect(lever).toBeDefined();
    expect(text(lever)).toContain(money(weekly));
    // Per-$1,000 DTI uplift = dtiCap × 1000.
    expect(text(lever)).toContain(money(inputs.dtiCap * 1000));
  });
});

describe("capacityLevers — servicing-bound", () => {
  // Plenty of DTI headroom, but a card limit + modest income constrain servicing.
  const inputs: CapacityInputs = { ...base, income: 120_000, creditLimit: 20_000 };
  const result = computeCapacity(inputs);
  const k = loanFromMonthly(1, inputs.rate + inputs.buffer, inputs.loanTerm);

  it("is genuinely servicing-bound", () => {
    expect(result.maxLoanByServicing).toBeLessThan(result.maxLoanByDti);
  });

  it("quantifies the card-limit lever from k", () => {
    const levers = capacityLevers(inputs, result);
    const freed = inputs.creditLimit * CREDIT_CARD_ASSESSMENT_RATE;
    const lever = levers.find((l) => /consumer debt/i.test(l.title));
    expect(lever).toBeDefined();
    expect(text(lever)).toContain(money(round1000(freed * k)));
  });

  it("quantifies the income/rent lever from k (shaded rent)", () => {
    const levers = capacityLevers(inputs, result);
    const monthly = (100 * 52 * (inputs.rentShading ?? 0.8)) / 12;
    const lever = levers.find((l) => /increase net income or rent/i.test(l.title));
    expect(lever).toBeDefined();
    expect(text(lever)).toContain(money(round1000(monthly * k)));
  });
});

describe("capacityLevers — declared-expenses lever gating", () => {
  it("appears only when declared expenses exceed HEM", () => {
    const high: CapacityInputs = { ...base, income: 120_000, declaredExpenses: 6_000 };
    const rHigh = computeCapacity(high);
    expect(high.declaredExpenses).toBeGreaterThan(rHigh.hem);
    const leversHigh = capacityLevers(high, rHigh);
    expect(leversHigh.some((l) => /living expenses toward hem/i.test(l.title))).toBe(true);
  });

  it("is absent when declared expenses are at or below HEM", () => {
    const low: CapacityInputs = { ...base, income: 120_000, declaredExpenses: 0 };
    const rLow = computeCapacity(low);
    expect(low.declaredExpenses).toBeLessThanOrEqual(rLow.hem);
    const leversLow = capacityLevers(low, rLow);
    expect(leversLow.some((l) => /living expenses toward hem/i.test(l.title))).toBe(false);
  });
});

describe("capacityLevers — safety properties", () => {
  it("never suggests interest-only, across binding sides", () => {
    const scenarios: CapacityInputs[] = [
      { ...base, income: 95_000, properties: [investment()] }, // DTI-bound
      { ...base, income: 120_000, creditLimit: 20_000 }, // servicing-bound
      { ...base, income: 120_000, declaredExpenses: 6_000 },
    ];
    for (const s of scenarios) {
      const levers = capacityLevers(s, computeCapacity(s));
      expect(/interest.?only/i.test(allText(levers))).toBe(false);
    }
  });

  it("caps the list at five levers", () => {
    const inputs: CapacityInputs = {
      ...base,
      income: 120_000,
      creditLimit: 20_000,
      personalLoan: 400,
      carLoan: 300,
      declaredExpenses: 6_000,
      loanTerm: 25,
      properties: [investment({ loanBalance: 300_000, value: 500_000, weeklyRent: 500 })],
    };
    const levers = capacityLevers(inputs, computeCapacity(inputs));
    expect(levers.length).toBeLessThanOrEqual(5);
  });

  it("exports the disclaimer constant", () => {
    expect(typeof CAPACITY_LEVER_DISCLAIMER).toBe("string");
    expect(CAPACITY_LEVER_DISCLAIMER).toContain("not credit assistance");
    expect(CAPACITY_LEVER_DISCLAIMER.length).toBeGreaterThan(50);
  });
});
