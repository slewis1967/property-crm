import { describe, expect, it } from "vitest";
import {
  assessProperty,
  autoAnnualCosts,
  computeCapacity,
  emptyProperty,
  lmiRateForLvr,
  negativeGearingAllowed,
  ngRestrictionApplies,
  solvePurchasePrice,
  type CapacityInputs,
  type ExistingProperty,
} from "./capacity";
import { dutyPayable } from "./stampDuty";

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

describe("autoAnnualCosts", () => {
  it("prices an investment at 25% of gross rent when that dominates", () => {
    expect(autoAnnualCosts({ use: "investment", value: 0, weeklyRent: 600 })).toBeCloseTo(
      600 * 52 * 0.25,
      5,
    );
  });

  it("floors an under-rented investment on its value", () => {
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

describe("negative gearing eligibility", () => {
  it("does not restrict before 2027-28", () => {
    expect(ngRestrictionApplies("2025-26")).toBe(false);
    expect(ngRestrictionApplies("2026-27")).toBe(false);
    expect(ngRestrictionApplies("2027-28")).toBe(true);
  });

  it("allows everything before the reform bites", () => {
    const p = { heldBeforeNgCutoff: false, isNewBuild: false };
    expect(negativeGearingAllowed(p, "2026-27")).toBe(true);
  });

  it("grandfathers property held at the 12 May 2026 cutoff", () => {
    expect(negativeGearingAllowed({ heldBeforeNgCutoff: true, isNewBuild: false }, "2027-28")).toBe(
      true,
    );
  });

  it("allows a new build after the reform", () => {
    expect(negativeGearingAllowed({ heldBeforeNgCutoff: false, isNewBuild: true }, "2027-28")).toBe(
      true,
    );
  });

  it("disallows an established property bought after the cutoff", () => {
    expect(
      negativeGearingAllowed({ heldBeforeNgCutoff: false, isNewBuild: false }, "2027-28"),
    ).toBe(false);
  });
});

describe("assessProperty", () => {
  it("shades rent and stresses the rate", () => {
    const a = assessProperty(investment(), 3, 0.8);
    expect(a.grossMonthlyRent).toBeCloseTo((550 * 52) / 12, 5);
    expect(a.assessedMonthlyRent).toBeCloseTo(a.grossMonthlyRent * 0.8, 5);
    expect(a.monthlyRepayment).toBeGreaterThan(3000); // at 9.5%, not 6.5%
  });

  it("deducts interest at the ACTUAL rate, not the stressed rate", () => {
    const a = assessProperty(investment({ loanBalance: 400000, rate: 6.5 }), 3, 0.8);
    expect(a.annualInterest).toBeCloseTo(26000, 5); // 400k × 6.5%, buffer excluded
  });

  it("computes the tax loss as rent − interest − costs", () => {
    // $500/wk = $26,000 rent; interest $45,500; auto costs = max(6,500, 6,300) = 6,500
    const a = assessProperty(
      investment({ loanBalance: 700000, rate: 6.5, weeklyRent: 500, value: 700000 }),
      3,
      0.8,
    );
    expect(a.annualTaxLoss).toBeCloseTo(45500 + 6500 - 26000, 0);
  });

  it("gives an owner-occupied property no rent and no tax loss", () => {
    const a = assessProperty(investment({ use: "owner_occupied", weeklyRent: 700 }), 3, 0.8);
    expect(a.assessedMonthlyRent).toBe(0);
    expect(a.annualTaxLoss).toBe(0);
    expect(a.grossMonthlyRent).toBeGreaterThan(0);
  });

  it("has no tax loss when positively geared", () => {
    expect(assessProperty(investment({ loanBalance: 0, weeklyRent: 700 }), 3, 0.8).annualTaxLoss).toBe(0);
  });

  it("assesses an interest-only loan harder than the same P&I loan", () => {
    const pi = assessProperty(investment({ interestOnly: false }), 3, 0.8);
    const io = assessProperty(investment({ interestOnly: true, ioYearsRemaining: 3 }), 3, 0.8);
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

  it("flags negative-gearing eligibility for the assessed year", () => {
    const grandfathered = investment({ heldBeforeNgCutoff: true });
    const bought = investment({ heldBeforeNgCutoff: false, isNewBuild: false });
    expect(assessProperty(bought, 3, 0.8, "2026-27").negativeGearingAllowed).toBe(true);
    expect(assessProperty(bought, 3, 0.8, "2027-28").negativeGearingAllowed).toBe(false);
    expect(assessProperty(grandfathered, 3, 0.8, "2027-28").negativeGearingAllowed).toBe(true);
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
    expect(r.purchasePrice).toBeLessThan(750000);
  });

  it("gives an FHB a bigger buy than a non-FHB on the same cash", () => {
    const opts = { maxLoan: 500000, deposit: 120000, state: "QLD" as const, closingCosts: 3000 };
    expect(solvePurchasePrice({ ...opts, isFhb: true }).purchasePrice).toBeGreaterThan(
      solvePurchasePrice({ ...opts, isFhb: false }).purchasePrice,
    );
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
  it("produces a sane single-income baseline and converges", () => {
    const r = computeCapacity(base);
    expect(r.maxLoan).toBeGreaterThan(300000);
    expect(r.maxLoan).toBeLessThan(800000);
    expect(r.surplus).toBeGreaterThan(0);
    expect(r.converged).toBe(true);
  });

  it("lends more under the 2026-27 tax cut than under 2025-26", () => {
    const now = computeCapacity(base);
    const before = computeCapacity({ ...base, taxYear: "2025-26" });
    expect(now.maxLoan).toBeGreaterThan(before.maxLoan);
  });

  it("lends more again in 2027-28 when the rate drops to 14c", () => {
    const later = computeCapacity({ ...base, taxYear: "2027-28" });
    expect(later.maxLoan).toBeGreaterThan(computeCapacity(base).maxLoan);
  });

  it("recognises the standard deduction", () => {
    const withDed = computeCapacity(base);
    const without = computeCapacity({ ...base, claimsStandardDeduction: false });
    expect(withDed.maxLoan).toBeGreaterThan(without.maxLoan);
  });

  it("charges ONE household Medicare levy, using family thresholds", () => {
    const couple = computeCapacity({ ...base, income: 25000, partner: 20000 });
    // Family income $45,000 is under the $47,238 family threshold → no levy,
    // even though $25,000 alone would be shaded under the singles threshold.
    expect(couple.medicareLevy).toBe(0);
  });

  it("charges a levy on a single at the same household income", () => {
    const single = computeCapacity({ ...base, income: 45000, partner: 0 });
    expect(single.medicareLevy).toBeGreaterThan(0);
  });

  // ── DTI ──

  it("caps at the DTI ceiling when servicing would allow more", () => {
    const r = computeCapacity({ ...base, income: 400000, partner: 300000, rate: 3 });
    expect(r.maxLoanByServicing).toBeGreaterThan(r.maxLoanByDti);
    expect(r.bindingConstraint).toBe("dti");
    expect(r.maxLoan).toBe(r.maxLoanByDti);
    expect(r.dtiAtMax).toBeCloseTo(6, 3);
  });

  it("reports servicing as the binding constraint for ordinary borrowers", () => {
    const r = computeCapacity(base);
    expect(r.bindingConstraint).toBe("servicing");
  });

  it("counts existing mortgage debt toward the DTI ceiling", () => {
    const rich = { ...base, income: 400000, partner: 300000, rate: 3 };
    const clean = computeCapacity(rich);
    const geared = computeCapacity({
      ...rich,
      properties: [investment({ loanBalance: 1500000, value: 1800000, weeklyRent: 0 })],
    });
    expect(clean.maxLoanByDti - geared.maxLoanByDti).toBeCloseTo(1500000, 0);
  });

  it("counts personal and car loan BALANCES toward the DTI ceiling", () => {
    const rich = { ...base, income: 400000, partner: 300000, rate: 3 };
    const clean = computeCapacity(rich);
    const withBalances = computeCapacity({ ...rich, consumerDebtBalance: 80000 });
    expect(clean.maxLoanByDti - withBalances.maxLoanByDti).toBeCloseTo(80000, 0);
    expect(withBalances.maxLoan).toBeLessThan(clean.maxLoan);
  });

  it("counts credit card limits toward DTI at face value", () => {
    const rich = { ...base, income: 400000, partner: 300000, rate: 3 };
    const clean = computeCapacity(rich);
    const carded = computeCapacity({ ...rich, creditLimit: 30000 });
    expect(clean.maxLoanByDti - carded.maxLoanByDti).toBeCloseTo(30000, 0);
  });

  it("assesses credit card limits at 3.8% of the limit per month for servicing", () => {
    expect(computeCapacity({ ...base, creditLimit: 20000 }).consumerDebtCommit).toBeCloseTo(760, 5);
  });

  it("leaves servicing untouched by a consumer balance (only DTI moves)", () => {
    const a = computeCapacity(base);
    const b = computeCapacity({ ...base, consumerDebtBalance: 50000 });
    expect(b.maxLoanByServicing).toBeCloseTo(a.maxLoanByServicing, 5);
  });

  // ── Portfolio ──

  it("lets a strongly cash-flow-positive property increase capacity", () => {
    const withIp = computeCapacity({
      ...base,
      properties: [investment({ loanBalance: 0, value: 700000, weeklyRent: 700 })],
    });
    expect(withIp.maxLoan).toBeGreaterThan(computeCapacity(base).maxLoan);
  });

  it("lets a negatively geared property reduce capacity despite the tax benefit", () => {
    const withIp = computeCapacity({
      ...base,
      properties: [investment({ loanBalance: 700000, value: 750000, weeklyRent: 450 })],
    });
    expect(withIp.maxLoan).toBeLessThan(computeCapacity(base).maxLoan);
    expect(withIp.portfolioNetMonthly).toBeLessThan(0);
    expect(withIp.negativeGearingBenefitMonthly).toBeGreaterThan(0);
  });

  it("counts an owner-occupied second home as pure drag", () => {
    const r = computeCapacity({
      ...base,
      properties: [investment({ use: "owner_occupied", weeklyRent: 0, loanBalance: 300000 })],
    });
    expect(r.portfolioRent).toBe(0);
    expect(r.portfolioNetMonthly).toBeLessThan(0);
    expect(r.deductibleLoss).toBe(0); // owner-occupied is never negatively geared
  });

  it("scales with the number of properties without double-counting", () => {
    const one = computeCapacity({ ...base, properties: [investment({ id: "a" })] });
    const two = computeCapacity({
      ...base,
      properties: [investment({ id: "a" }), investment({ id: "b" })],
    });
    expect(two.portfolioRent).toBeCloseTo(one.portfolioRent * 2, 5);
    expect(two.portfolioRepayments).toBeCloseTo(one.portfolioRepayments * 2, 5);
    expect(two.assessed).toHaveLength(2);
  });

  // ── Negative gearing ──

  const gearedIp = investment({ loanBalance: 700000, value: 750000, weeklyRent: 450 });

  it("lends more with the negative-gearing benefit recognised than without", () => {
    const on = computeCapacity({ ...base, properties: [gearedIp] });
    const off = computeCapacity({ ...base, properties: [gearedIp], negativeGearing: false });
    expect(on.maxLoan).toBeGreaterThan(off.maxLoan);
    expect(off.negativeGearingBenefitMonthly).toBe(0);
    expect(off.deductibleLoss).toBe(0);
    expect(off.disallowedLoss).toBeGreaterThan(0);
  });

  it("disallows the loss on an established property bought after the cutoff, from 2027-28", () => {
    const bought = { ...gearedIp, heldBeforeNgCutoff: false, isNewBuild: false };
    const before = computeCapacity({ ...base, taxYear: "2026-27", properties: [bought] });
    const after = computeCapacity({ ...base, taxYear: "2027-28", properties: [bought] });
    expect(before.deductibleLoss).toBeGreaterThan(0);
    expect(after.deductibleLoss).toBe(0);
    expect(after.disallowedLoss).toBeGreaterThan(0);
  });

  it("keeps the loss on a grandfathered property in 2027-28", () => {
    const r = computeCapacity({
      ...base,
      taxYear: "2027-28",
      properties: [{ ...gearedIp, heldBeforeNgCutoff: true }],
    });
    expect(r.deductibleLoss).toBeGreaterThan(0);
    expect(r.disallowedLoss).toBe(0);
  });

  it("keeps the loss on a new build bought after the cutoff", () => {
    const r = computeCapacity({
      ...base,
      taxYear: "2027-28",
      properties: [{ ...gearedIp, heldBeforeNgCutoff: false, isNewBuild: true }],
    });
    expect(r.deductibleLoss).toBeGreaterThan(0);
    expect(r.disallowedLoss).toBe(0);
  });

  it("attributes the loss to the higher earner", () => {
    // Same household income, loss deducted at the top marginal rate either way,
    // but the higher earner's taxable income is what falls.
    const r = computeCapacity({ ...base, income: 60000, partner: 180000, properties: [gearedIp] });
    expect(r.partnerTax.taxableIncome).toBeLessThan(180000);
    expect(r.applicantTax.taxableIncome).toBeCloseTo(60000 - 1000, 0); // std deduction only
  });

  // ── The new property ──

  it("adds shaded rent from the property being purchased", () => {
    const oo = computeCapacity(base);
    const ip = computeCapacity({ ...base, newWeeklyRent: 600 });
    expect(ip.maxLoan).toBeGreaterThan(oo.maxLoan);
    expect(ip.newPropertyMonthlyRent).toBeCloseTo((600 * 52 * 0.8) / 12, 5);
  });

  // At the default 6× DTI these scenarios all cap out at the same ceiling, which
  // would hide the negative-gearing difference entirely. Lift the cap so
  // servicing binds and the tax effect is actually visible.
  const servicingBound = { ...base, dtiCap: 9 };

  it("solves the new property's own negative-gearing loss to a fixed point", () => {
    const r = computeCapacity({ ...servicingBound, newWeeklyRent: 500 });
    expect(r.converged).toBe(true);
    expect(r.bindingConstraint).toBe("servicing");
    expect(r.newPropertyTaxLoss).toBeGreaterThan(0);
    // The loss must be self-consistent with the loan it implies:
    // interest(maxLoan) + costs − rent
    const interest = r.maxLoan * 0.065;
    const costs = 500 * 52 * 0.25;
    expect(r.newPropertyTaxLoss).toBeCloseTo(interest + costs - 500 * 52, -2);
  });

  it("lends more on a new-build purchase than an established one, post-reform", () => {
    const opts = { ...servicingBound, taxYear: "2027-28" as const, newWeeklyRent: 500 };
    const newBuild = computeCapacity({ ...opts, newPropertyIsNewBuild: true });
    const established = computeCapacity({ ...opts, newPropertyIsNewBuild: false });
    expect(newBuild.maxLoan).toBeGreaterThan(established.maxLoan);
    expect(established.disallowedLoss).toBeGreaterThan(0);
    expect(newBuild.disallowedLoss).toBe(0);
  });

  it("treats new-build and established the same before the reform", () => {
    const opts = { ...servicingBound, taxYear: "2026-27" as const, newWeeklyRent: 500 };
    const a = computeCapacity({ ...opts, newPropertyIsNewBuild: true });
    const b = computeCapacity({ ...opts, newPropertyIsNewBuild: false });
    expect(a.maxLoan).toBeCloseTo(b.maxLoan, 0);
  });

  it("has no new-property loss for an owner-occupied purchase", () => {
    expect(computeCapacity(base).newPropertyTaxLoss).toBe(0);
  });

  // ── Regression: new-vs-existing consistency, shade-only servicing ──
  //
  // Standard AU lender practice (owner-confirmed): shade gross rent to ~80% and
  // ADD it to servicing income; the 20% haircut IS the holding-cost allowance,
  // so holding costs are NOT subtracted from servicing on top of the shade.
  //
  // The property being bought must be assessed for servicing the SAME way as an
  // identical existing portfolio property. PR #50 first made the two paths
  // consistent, but at the double-dip baseline (costs deducted from servicing on
  // both). This suite keeps that consistency property while pinning both paths
  // to the correct SHADE-ONLY baseline: each adds 80% of gross rent with NO cost
  // deduction, so a property's holding costs do not move the servicing surplus.
  describe("new-vs-existing consistency (shade-only)", () => {
    // Negative gearing OFF so no tax effect muddies a pure servicing
    // comparison; a high DTI cap so servicing (not DTI) is what these exercise.
    const cfg = { ...base, negativeGearing: false, dtiCap: 20 };
    const WEEKLY = 500;

    // The SAME property, once as the new purchase, once as an existing
    // unencumbered investment. loanBalance 0 → no repayment drag; value chosen
    // so the 25%-of-rent auto-cost dominates the value floor, exactly matching
    // the new property's auto-cost. The only difference is new vs existing.
    const asNew = computeCapacity({ ...cfg, newWeeklyRent: WEEKLY });
    const asExisting = computeCapacity({
      ...cfg,
      properties: [investment({ loanBalance: 0, value: 600000, weeklyRent: WEEKLY })],
    });

    it("contributes the same to serviceability whether the property is new or existing", () => {
      // Net income, living expenses and consumer debt are identical across the
      // two runs, so equal surplus ⇒ the property's servicing treatment is
      // consistent between the new-purchase and existing-portfolio paths.
      expect(asNew.surplus).toBeCloseTo(asExisting.surplus, 2);
    });

    it("adds 80% shaded rent to serviceability, with holding costs NOT deducted", () => {
      const oo = computeCapacity(cfg); // owner-occ baseline: same income & expenses
      const monthlyRent = (WEEKLY * 52 * base.rentShading) / 12;
      // The new property lifts the surplus by the full 80% shaded rent. The
      // shade IS the holding-cost allowance, so costs are NOT subtracted on top.
      expect(asNew.surplus - oo.surplus).toBeCloseTo(monthlyRent, 2);
    });

    it("does not let a property's holding costs reduce the servicing surplus", () => {
      // Same property, but force much larger declared holding costs. Under
      // shade-only servicing this must NOT change the surplus (costs only feed
      // the tax/NG view, which is off here) — it only changes the reported
      // portfolioCosts figure.
      const cheap = computeCapacity({
        ...cfg,
        properties: [
          investment({ loanBalance: 0, value: 600000, weeklyRent: WEEKLY, autoCosts: true }),
        ],
      });
      const costly = computeCapacity({
        ...cfg,
        properties: [
          investment({
            loanBalance: 0,
            value: 600000,
            weeklyRent: WEEKLY,
            autoCosts: false,
            annualCosts: 40000,
          }),
        ],
      });
      expect(costly.portfolioCosts).toBeGreaterThan(cheap.portfolioCosts);
      expect(costly.surplus).toBeCloseTo(cheap.surplus, 5);
      expect(costly.maxLoanByServicing).toBeCloseTo(cheap.maxLoanByServicing, 5);
    });
  });

  // ── HECS ──

  it("reduces capacity for a borrower with HECS", () => {
    expect(computeCapacity({ ...base, hasHecs: true }).maxLoan).toBeLessThan(
      computeCapacity(base).maxLoan,
    );
  });

  it("ignores HECS once the balance is nearly repaid", () => {
    const nearlyPaid = computeCapacity({ ...base, hasHecs: true, hecsBalance: 200 });
    const fresh = computeCapacity({ ...base, hasHecs: true, hecsBalance: 60000 });
    expect(nearlyPaid.maxLoan).toBeGreaterThan(fresh.maxLoan);
  });

  it("does not let a rental loss reduce the HELP repayment", () => {
    const r = computeCapacity({ ...base, hasHecs: true, properties: [gearedIp] });
    const noIp = computeCapacity({ ...base, hasHecs: true });
    expect(r.applicantTax.hecs).toBeCloseTo(noIp.applicantTax.hecs, 5);
  });

  // ── Expenses, floors, edges ──

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
});
