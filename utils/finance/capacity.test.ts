import { describe, expect, it } from "vitest";
import {
  assessProperty,
  autoAnnualCosts,
  computeCapacity,
  emptyProperty,
  lmiRateForLvr,
  solvePurchasePrice,
  type CapacityInputs,
  type ExistingProperty,
} from "./capacity";
import { dutyPayable } from "./stampDuty";

const base: CapacityInputs = {
  income: 120000,
  partner: 0,
  otherIncome: 0,
  hasHecs: false,
  partnerHasHecs: false,
  dependents: 0,
  declaredExpenses: 0,
  deposit: 0,
  state: "QLD",
  isFhb: false,
  closingCosts: 3000,
  newWeeklyRent: 0,
  properties: [],
  creditLimit: 0,
  personalLoan: 0,
  carLoan: 0,
  otherDebts: 0,
  rate: 6.5,
  buffer: 3,
  loanTerm: 30,
  rentShading: 0.8,
  dtiCap: 6,
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

describe("autoAnnualCosts", () => {
  it("prices an investment at 25% of gross rent when that dominates", () => {
    expect(autoAnnualCosts({ use: "investment", value: 0, weeklyRent: 600 })).toBeCloseTo(
      600 * 52 * 0.25,
      5,
    );
  });

  it("floors an under-rented investment on its value", () => {
    // Let to family at $100/wk: 25% of rent is $1,300 — unrealistically low
    // for an $800k asset, so the value-based floor takes over.
    const costs = autoAnnualCosts({ use: "investment", value: 800000, weeklyRent: 100 });
    expect(costs).toBeCloseTo(800000 * 0.009, 5);
  });

  it("charges an owner-occupier on value, with no management or vacancy", () => {
    expect(autoAnnualCosts({ use: "owner_occupied", value: 900000, weeklyRent: 0 })).toBeCloseTo(
      8100,
      5,
    );
  });

  it("is zero when nothing is known", () => {
    expect(autoAnnualCosts({ use: "investment", value: 0, weeklyRent: 0 })).toBe(0);
  });
});

describe("assessProperty", () => {
  it("shades rent and stresses the rate", () => {
    const a = assessProperty(investment(), 3, 0.8);
    expect(a.grossMonthlyRent).toBeCloseTo((550 * 52) / 12, 5);
    expect(a.assessedMonthlyRent).toBeCloseTo(a.grossMonthlyRent * 0.8, 5);
    // repayment must be computed at 9.5%, not 6.5%
    expect(a.monthlyRepayment).toBeGreaterThan(3000);
  });

  it("credits no rent for an owner-occupied property", () => {
    const a = assessProperty(investment({ use: "owner_occupied", weeklyRent: 700 }), 3, 0.8);
    expect(a.assessedMonthlyRent).toBe(0);
    expect(a.grossMonthlyRent).toBeGreaterThan(0);
  });

  it("assesses an interest-only loan harder than the same P&I loan", () => {
    const pi = assessProperty(investment({ interestOnly: false }), 3, 0.8);
    const io = assessProperty(
      investment({ interestOnly: true, ioYearsRemaining: 3 }),
      3,
      0.8,
    );
    // IO amortises over 22 residual years, not 25 → bigger assessed repayment
    expect(io.monthlyRepayment).toBeGreaterThan(pi.monthlyRepayment);
  });

  it("honours declared costs over the estimate", () => {
    const a = assessProperty(investment({ autoCosts: false, annualCosts: 12000 }), 3, 0.8);
    expect(a.costsWereEstimated).toBe(false);
    expect(a.monthlyCosts).toBeCloseTo(1000, 5);
  });

  it("reports equity net of the loan, never negative", () => {
    expect(assessProperty(investment({ value: 300000, loanBalance: 400000 }), 3, 0.8).equity).toBe(0);
  });
});

describe("solvePurchasePrice", () => {
  it("conserves cash: price + duty + costs == loan + deposit", () => {
    const r = solvePurchasePrice({
      maxLoan: 600000,
      deposit: 150000,
      state: "QLD",
      isFhb: false,
      closingCosts: 3000,
    });
    expect(r.purchasePrice + r.duty + 3000).toBeCloseTo(750000, 0);
  });

  it("computes duty on the settled price, not the pre-duty price", () => {
    const r = solvePurchasePrice({
      maxLoan: 600000,
      deposit: 150000,
      state: "QLD",
      isFhb: false,
      closingCosts: 3000,
    });
    expect(r.duty).toBeCloseTo(dutyPayable("QLD", r.purchasePrice, false), 0);
    expect(r.purchasePrice).toBeLessThan(750000); // duty ate into the deposit
  });

  it("gives an FHB a bigger buy than a non-FHB on the same cash", () => {
    const opts = { maxLoan: 500000, deposit: 120000, state: "QLD" as const, closingCosts: 3000 };
    const fhb = solvePurchasePrice({ ...opts, isFhb: true });
    const std = solvePurchasePrice({ ...opts, isFhb: false });
    expect(fhb.purchasePrice).toBeGreaterThan(std.purchasePrice);
  });

  it("flags a deposit that cannot cover duty and costs", () => {
    const r = solvePurchasePrice({
      maxLoan: 900000,
      deposit: 5000,
      state: "NSW",
      isFhb: false,
      closingCosts: 3000,
    });
    expect(r.shortfall).toBeGreaterThan(0);
  });

  it("never returns a negative price", () => {
    const r = solvePurchasePrice({
      maxLoan: 0,
      deposit: 0,
      state: "VIC",
      isFhb: false,
      closingCosts: 3000,
    });
    expect(r.purchasePrice).toBe(0);
  });
});

describe("computeCapacity", () => {
  it("produces a sane single-income baseline", () => {
    const r = computeCapacity(base);
    expect(r.maxLoan).toBeGreaterThan(300000);
    expect(r.maxLoan).toBeLessThan(800000);
    expect(r.surplus).toBeGreaterThan(0);
  });

  it("caps at the DTI ceiling when servicing would allow more", () => {
    // High income at a low rate — the 2021 conditions the DTI cap was
    // introduced to contain. At a 9.5% stress rate servicing binds first,
    // so a realistic DTI test has to drop the rate.
    const r = computeCapacity({ ...base, income: 400000, partner: 300000, rate: 3 });
    expect(r.maxLoanByServicing).toBeGreaterThan(r.maxLoanByDti);
    expect(r.bindingConstraint).toBe("dti");
    expect(r.maxLoan).toBe(r.maxLoanByDti);
    expect(r.dtiAtMax).toBeCloseTo(6, 3);
  });

  it("counts existing mortgage debt toward the DTI ceiling", () => {
    const rich = { ...base, income: 400000, partner: 300000, rate: 3 };
    const clean = computeCapacity(rich);
    const geared = computeCapacity({
      ...rich,
      properties: [investment({ loanBalance: 1500000, value: 1800000, weeklyRent: 0 })],
    });
    // The existing $1.5M sits in the DTI numerator, so it comes straight off
    // the new-loan headroom (net of the extra gross-rent denominator, here nil).
    expect(clean.maxLoanByDti - geared.maxLoanByDti).toBeCloseTo(1500000, 0);
    expect(geared.dtiAtMax).toBeLessThanOrEqual(6.0001);
  });

  it("reports servicing as the binding constraint for ordinary borrowers", () => {
    const r = computeCapacity(base);
    expect(r.bindingConstraint).toBe("servicing");
    expect(r.maxLoan).toBeCloseTo(r.maxLoanByServicing, 5);
  });

  it("subtracts existing portfolio debt from the DTI headroom", () => {
    const rich = { ...base, income: 400000, partner: 300000 };
    const without = computeCapacity(rich);
    const withDebt = computeCapacity({
      ...rich,
      properties: [investment({ loanBalance: 800000, weeklyRent: 0, value: 0 })],
    });
    expect(withDebt.maxLoanByDti).toBeLessThan(without.maxLoanByDti);
  });

  it("lets a strongly cash-flow-positive property increase capacity", () => {
    const none = computeCapacity(base);
    const withIp = computeCapacity({
      ...base,
      properties: [investment({ loanBalance: 0, value: 700000, weeklyRent: 700 })],
    });
    expect(withIp.maxLoan).toBeGreaterThan(none.maxLoan);
  });

  it("lets a negatively geared property reduce capacity", () => {
    const none = computeCapacity(base);
    const withIp = computeCapacity({
      ...base,
      properties: [investment({ loanBalance: 700000, value: 750000, weeklyRent: 450 })],
    });
    expect(withIp.maxLoan).toBeLessThan(none.maxLoan);
    expect(withIp.portfolioNetMonthly).toBeLessThan(0);
  });

  it("counts an owner-occupied second home as pure drag", () => {
    const r = computeCapacity({
      ...base,
      properties: [investment({ use: "owner_occupied", weeklyRent: 0, loanBalance: 300000 })],
    });
    expect(r.portfolioRent).toBe(0);
    expect(r.portfolioNetMonthly).toBeLessThan(0);
  });

  it("adds shaded rent from the property being purchased", () => {
    const oo = computeCapacity(base);
    const ip = computeCapacity({ ...base, newWeeklyRent: 600 });
    expect(ip.maxLoan).toBeGreaterThan(oo.maxLoan);
    expect(ip.newPropertyMonthlyRent).toBeCloseTo((600 * 52 * 0.8) / 12, 5);
  });

  it("includes portfolio rent in the HEM income tier and the DTI denominator", () => {
    const r = computeCapacity({
      ...base,
      properties: [investment({ weeklyRent: 800 })],
    });
    expect(r.dtiIncome).toBeGreaterThan(base.income);
    expect(r.grossHousehold).toBeGreaterThan(base.income);
  });

  it("assesses credit card limits at 3.8% of the limit per month", () => {
    const r = computeCapacity({ ...base, creditLimit: 20000 });
    expect(r.consumerDebtCommit).toBeCloseTo(760, 5);
  });

  it("floors living expenses at HEM when the client under-declares", () => {
    const r = computeCapacity({ ...base, declaredExpenses: 200 });
    expect(r.livingExp).toBe(r.hem);
  });

  it("returns a zero loan, not a negative one, when the surplus is gone", () => {
    const r = computeCapacity({ ...base, income: 45000, otherDebts: 4000 });
    expect(r.surplus).toBeLessThan(0);
    expect(r.maxLoan).toBe(0);
    expect(r.bindingConstraint).toBe("none");
    expect(r.purchasePrice).toBe(0);
  });

  it("nets stamp duty out of the deposit before pricing the purchase", () => {
    const r = computeCapacity({ ...base, deposit: 150000, state: "NSW" });
    expect(r.stampDuty).toBeGreaterThan(0);
    expect(r.purchasePrice).toBeLessThan(r.maxLoan + 150000);
    expect(r.purchasePrice + r.stampDuty + base.closingCosts).toBeCloseTo(r.maxLoan + 150000, 0);
  });

  it("raises LVR once duty is netted out, and triggers LMI accordingly", () => {
    const r = computeCapacity({ ...base, deposit: 60000, state: "NSW" });
    expect(r.lvr).toBeGreaterThan(80);
    expect(r.needsLmi).toBe(true);
    expect(r.lmiPremium).toBeGreaterThan(0);
  });

  it("charges no LMI at or below 80% LVR", () => {
    expect(lmiRateForLvr(80)).toBe(0);
    expect(lmiRateForLvr(80.1)).toBeGreaterThan(0);
  });

  it("reduces capacity for a borrower with HECS", () => {
    const without = computeCapacity(base);
    const withHecs = computeCapacity({ ...base, hasHecs: true });
    expect(withHecs.maxLoan).toBeLessThan(without.maxLoan);
  });

  it("ignores HECS entirely once the balance is nearly repaid", () => {
    const nearlyPaid = computeCapacity({ ...base, hasHecs: true, hecsBalance: 200 });
    const fresh = computeCapacity({ ...base, hasHecs: true, hecsBalance: 60000 });
    expect(nearlyPaid.maxLoan).toBeGreaterThan(fresh.maxLoan);
  });

  it("scales with the number of properties without double-counting rent", () => {
    const one = computeCapacity({ ...base, properties: [investment({ id: "a" })] });
    const two = computeCapacity({
      ...base,
      properties: [investment({ id: "a" }), investment({ id: "b" })],
    });
    expect(two.portfolioRent).toBeCloseTo(one.portfolioRent * 2, 5);
    expect(two.portfolioRepayments).toBeCloseTo(one.portfolioRepayments * 2, 5);
    expect(two.assessed).toHaveLength(2);
  });
});
