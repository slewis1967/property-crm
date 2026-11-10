/**
 * Borrowing-capacity engine — pure, no React. Unit-tested in `capacity.test.ts`.
 *
 * Models what an Australian lender's servicing calculator does:
 *
 *   1. Net income      — PAYG tax + LITO + standard deduction + HECS marginal
 *                        repayment per applicant, then ONE household Medicare
 *                        levy on family income.
 *   2. Portfolio       — every property (existing AND the one being bought) adds
 *                        rent SHADED to ~80% and subtracts its stressed
 *                        repayment. The 20% shade IS the holding-cost allowance
 *                        (management, rates, insurance, maintenance, vacancy);
 *                        holding costs are NOT subtracted from servicing on top
 *                        of the shade — doing both is a double-dip. Costs feed
 *                        only the tax/negative-gearing view (item 3).
 *   3. Negative gearing— a property's tax loss (rent − interest − costs) is a
 *                        deduction, lifting net income. This is why holding
 *                        costs are still computed: they set the TRUE tax
 *                        position even though servicing shades rather than
 *                        deducts them. Subject to the 2027-28 new-build
 *                        restriction. See NEGATIVE GEARING below.
 *   4. Living expenses — max(declared, HEM benchmark).
 *   5. Consumer debt   — card limits at 3.8%/month (APG 223), plus stated
 *                        monthly personal/car/other commitments.
 *   6. Capacity        — surplus capitalised at the assessment rate (rate +
 *                        APRA's +3% buffer), then CAPPED BY DTI.
 *   7. Purchase price  — deposit net of stamp duty + closing costs, solved
 *                        as a fixed point because duty depends on the price.
 *
 * NEGATIVE GEARING (Treasury Laws Amendment (Tax Reform No. 1) Act 2026)
 *
 * From 1 Jul 2027 negative gearing on residential investment property is
 * limited to NEW BUILDS. Properties held at 7:30pm AEST 12 May 2026 are
 * grandfathered. So the tax benefit is not a blanket add-back — it depends on
 * the property and the assessment year, which is why `ExistingProperty` carries
 * `heldBeforeNgCutoff` and `isNewBuild`, and why `taxYear` is an input.
 *
 * The loss is applied as a DEDUCTION inside `personalTax`, not bolted on as a
 * separate income line. That avoids double-counting: the property's cash drag
 * lands in `portfolioNetMonthly`, and the tax it saves lands in net income.
 *
 * The shade-only servicing model matches standard Australian lender practice.
 * The minority "actuals method" (some lenders assess real declared rent net of
 * itemised holding costs instead of a flat shade) and separate strata /
 * body-corporate loading are NOT modelled.
 *
 * Everything here is indicative. Lender policy (postcode caps, casual-income
 * shading, FBT grossing) varies materially.
 */

import {
  CURRENT_TAX_YEAR,
  loanFromMonthly,
  marginalTaxRate,
  medicareLevy,
  pAndIMonthly,
  personalTax,
  TAX_YEARS,
  type PersonalTax,
  type TaxYear,
} from "./tax";
import { dutyPayable, type AusState } from "./stampDuty";

// ─── HEM ───────────────────────────────────────────────────────────────────
//
// Approximation of the Melbourne Institute's quarterly HES benchmark —
// simplified to household composition × income tier. Good enough for an
// advisor sanity check, not for a submission.

export function hemMonthly(adults: 1 | 2, kids: number, grossHousehold: number): number {
  const tier = grossHousehold >= 200000 ? "high" : grossHousehold >= 100000 ? "mid" : "low";
  const base =
    adults === 1
      ? { low: 1640, mid: 1880, high: 2200 }[tier]
      : { low: 2700, mid: 3200, high: 3800 }[tier];
  const perKid = tier === "high" ? 700 : tier === "mid" ? 540 : 420;
  return base + Math.max(0, kids) * perKid;
}

// ─── Negative gearing eligibility ──────────────────────────────────────────

/** The first income year in which the new-build restriction applies. */
export const NG_REFORM_YEAR: TaxYear = "2027-28";

/** 7:30pm AEST 12 May 2026 — properties held at this moment are grandfathered. */
export const NG_GRANDFATHER_CUTOFF = "2026-05-12T19:30:00+10:00";

function yearIndex(y: TaxYear): number {
  return TAX_YEARS.indexOf(y);
}

export function ngRestrictionApplies(year: TaxYear): boolean {
  return yearIndex(year) >= yearIndex(NG_REFORM_YEAR);
}

/**
 * Can this property's rental loss be deducted against wage income?
 * Before the reform year: always. After: only if grandfathered or a new build.
 */
export function negativeGearingAllowed(
  p: { heldBeforeNgCutoff: boolean; isNewBuild: boolean },
  year: TaxYear,
): boolean {
  if (!ngRestrictionApplies(year)) return true;
  return p.heldBeforeNgCutoff || p.isNewBuild;
}

// ─── Existing properties ───────────────────────────────────────────────────

export type PropertyUse = "owner_occupied" | "investment";

export type ExistingProperty = {
  id: string;
  label: string;
  use: PropertyUse;
  /** Current market value. Used for portfolio LVR and to floor auto costs. */
  value: number;
  loanBalance: number;
  /** Current interest rate, %. Assessed at rate + buffer; taxed at rate. */
  rate: number;
  /** Years left on the loan. */
  termRemaining: number;
  interestOnly: boolean;
  /** Years of interest-only left. Assessed P&I over the residual term after this. */
  ioYearsRemaining: number;
  weeklyRent: number;
  /**
   * Pooled annual holding costs — rates, insurance, maintenance, strata,
   * land tax, property management, vacancy allowance. One number on purpose:
   * advisors don't have the itemised split on a 30-minute call.
   *
   * Leave `autoCosts` on and the engine estimates it.
   */
  annualCosts: number;
  /** When true, `annualCosts` is ignored and the estimate is used. */
  autoCosts: boolean;
  /** Held at 7:30pm AEST 12 May 2026 → grandfathered from the NG restriction. */
  heldBeforeNgCutoff: boolean;
  /** A new build → retains negative gearing after the reform. */
  isNewBuild: boolean;
};

export function emptyProperty(id: string, label = "Property"): ExistingProperty {
  return {
    id,
    label,
    use: "investment",
    value: 0,
    loanBalance: 0,
    rate: 6.5,
    termRemaining: 25,
    interestOnly: false,
    ioYearsRemaining: 3,
    weeklyRent: 0,
    annualCosts: 0,
    autoCosts: true,
    // Someone entering a property they already own held it before the cutoff.
    heldBeforeNgCutoff: true,
    isNewBuild: false,
  };
}

/**
 * Estimate pooled annual holding costs when the advisor hasn't got them.
 *
 * Investment: 25% of gross rent — the same all-in ratio the Rental Yield
 * calculator defaults to (mgmt ~7%, ~2 weeks vacancy, rates, insurance,
 * minor maintenance). Floored by a value-based figure so a property let
 * cheaply to family isn't costed at almost nothing.
 *
 * Owner-occupied: 0.9% of value — rates, insurance, maintenance. No
 * management fee, no vacancy allowance.
 */
export const AUTO_COST_RENT_RATIO = 0.25;
export const AUTO_COST_VALUE_RATIO_INVESTMENT = 0.009;
export const AUTO_COST_VALUE_RATIO_OWNER = 0.009;

export function autoAnnualCosts(p: Pick<ExistingProperty, "use" | "value" | "weeklyRent">): number {
  const value = Math.max(0, p.value);
  if (p.use === "owner_occupied") return value * AUTO_COST_VALUE_RATIO_OWNER;
  const fromRent = Math.max(0, p.weeklyRent) * 52 * AUTO_COST_RENT_RATIO;
  const fromValue = value * AUTO_COST_VALUE_RATIO_INVESTMENT;
  return Math.max(fromRent, fromValue);
}

export type AssessedProperty = {
  id: string;
  label: string;
  use: PropertyUse;
  /** P&I at (rate + buffer) over the residual term. Interest-only loans are
   *  assessed P&I over the term remaining AFTER the IO period expires. */
  monthlyRepayment: number;
  grossMonthlyRent: number;
  /** Rent after lender shading. */
  assessedMonthlyRent: number;
  monthlyCosts: number;
  costsWereEstimated: boolean;
  /** Servicing contribution: shaded rent − stressed repayment. Holding costs
   *  are NOT subtracted here — the 80% shade already embeds them (see the
   *  top-of-file doc). Negative = the property drags capacity. */
  netMonthly: number;
  equity: number;
  /** Interest at the ACTUAL rate — the deductible portion, not the stressed one. */
  annualInterest: number;
  /** Deductible loss: gross rent − interest − costs, floored at 0. */
  annualTaxLoss: number;
  /** Whether that loss is deductible against wage income in the assessed year. */
  negativeGearingAllowed: boolean;
};

export function assessProperty(
  p: ExistingProperty,
  buffer: number,
  rentShading: number,
  year: TaxYear = CURRENT_TAX_YEAR,
): AssessedProperty {
  const amortYears = p.interestOnly
    ? Math.max(1, p.termRemaining - Math.max(0, p.ioYearsRemaining))
    : p.termRemaining;

  const monthlyRepayment = pAndIMonthly(p.loanBalance, p.rate + buffer, amortYears);

  const grossMonthlyRent = (Math.max(0, p.weeklyRent) * 52) / 12;
  const assessedMonthlyRent = p.use === "investment" ? grossMonthlyRent * rentShading : 0;

  const costsWereEstimated = p.autoCosts;
  const annualCosts = costsWereEstimated ? autoAnnualCosts(p) : Math.max(0, p.annualCosts);
  const monthlyCosts = annualCosts / 12;

  // Tax view: only investments deduct, only interest is deductible (not
  // principal), and only at the actual rate. Depreciation and capital works
  // are NOT modelled — they would increase the loss and the benefit.
  const annualInterest = Math.max(0, p.loanBalance) * (p.rate / 100);
  const taxableRental = grossMonthlyRent * 12 - annualInterest - annualCosts;
  const annualTaxLoss = p.use === "investment" ? Math.max(0, -taxableRental) : 0;

  return {
    id: p.id,
    label: p.label,
    use: p.use,
    monthlyRepayment,
    grossMonthlyRent,
    assessedMonthlyRent,
    monthlyCosts,
    costsWereEstimated,
    netMonthly: assessedMonthlyRent - monthlyRepayment,
    equity: Math.max(0, p.value - p.loanBalance),
    annualInterest,
    annualTaxLoss,
    negativeGearingAllowed: negativeGearingAllowed(p, year),
  };
}

// ─── Purchase price with duty + costs netted out ───────────────────────────

/**
 * Deposit has to pay stamp duty and closing costs before any of it lands on
 * the purchase price — but duty is a function of the price, so this is a
 * fixed point. Duty's marginal rate is ~5%, making `price = loan + deposit −
 * duty(price) − costs` a contraction; it converges in a handful of passes.
 */
export function solvePurchasePrice(opts: {
  maxLoan: number;
  deposit: number;
  state: AusState;
  isFhb: boolean;
  closingCosts: number;
}): { purchasePrice: number; duty: number; shortfall: number } {
  const { maxLoan, deposit, state, isFhb, closingCosts } = opts;
  const cash = Math.max(0, deposit);

  let price = maxLoan + cash;
  let duty = 0;
  for (let i = 0; i < 30; i++) {
    duty = dutyPayable(state, Math.max(0, price), isFhb);
    const next = maxLoan + cash - duty - closingCosts;
    if (Math.abs(next - price) < 1) {
      price = next;
      break;
    }
    price = next;
  }

  duty = dutyPayable(state, Math.max(0, price), isFhb);
  const usableDeposit = cash - duty - closingCosts;
  const shortfall = usableDeposit < 0 ? -usableDeposit : 0;

  return { purchasePrice: Math.max(0, price), duty, shortfall };
}

// ─── LMI ───────────────────────────────────────────────────────────────────

/** Mid-band LMI premium as a fraction of the loan. 0 at/below 80% LVR. */
export function lmiRateForLvr(lvr: number): number {
  if (lvr <= 80) return 0;
  if (lvr <= 82) return 0.005;
  if (lvr <= 85) return 0.0098;
  if (lvr <= 87) return 0.0156;
  if (lvr <= 90) return 0.0224;
  if (lvr <= 92) return 0.0307;
  if (lvr <= 95) return 0.045;
  return 0.056; // > 95% LVR — most lenders won't go here without specials
}

// ─── The engine ────────────────────────────────────────────────────────────

export const CREDIT_CARD_ASSESSMENT_RATE = 0.038; // APG 223: 3.8% of limit, monthly
export const DEFAULT_RENT_SHADING = 0.8;
export const DEFAULT_DTI_CAP = 6;
export const DEFAULT_CLOSING_COSTS = 3000;
export const OTHER_INCOME_SHADING = 0.8;

export type CapacityInputs = {
  /** Income year the assessment is run in. Drives rates, the standard
   *  deduction, and whether the negative-gearing restriction applies. */
  taxYear: TaxYear;

  // Income
  income: number;
  partner: number;
  otherIncome: number;
  hasHecs: boolean;
  partnerHasHecs: boolean;
  hecsBalance?: number | null;
  partnerHecsBalance?: number | null;
  /** $1,000 standard work-expense deduction (2026-27+). Off for someone with
   *  >$1,000 of real work expenses, or purely business/investment income. */
  claimsStandardDeduction: boolean;

  // Household
  dependents: number;
  declaredExpenses: number;

  // Deposit + purchase
  deposit: number;
  state: AusState;
  isFhb: boolean;
  closingCosts: number;

  // New property
  newWeeklyRent: number;
  /** A new build retains negative gearing after 1 Jul 2027. */
  newPropertyIsNewBuild: boolean;

  // Existing portfolio
  properties: ExistingProperty[];

  // Consumer debt
  creditLimit: number;
  personalLoan: number;
  carLoan: number;
  otherDebts: number;
  /** Total balances owing on personal/car/other loans. Feeds the DTI numerator
   *  — the monthly figures above only feed servicing. */
  consumerDebtBalance: number;

  // Loan parameters
  rate: number;
  buffer: number;
  loanTerm: number;
  rentShading: number;
  dtiCap: number;
  /** Recognise the tax benefit of rental losses. Off = conservative. */
  negativeGearing: boolean;

  // ─── Per-lender overrides (optional) ──────────────────────────────────
  // Defaulted to the generic figures above so every existing caller is
  // unaffected. Supplied by `utils/lender-policy/match.ts` when a scenario is
  // assessed against ONE lender's published servicing parameters — this is the
  // seam that turns the generic calculator into a per-lender one.

  /** Monthly assessment on a credit card limit, as a fraction.
   *  Defaults to `CREDIT_CARD_ASSESSMENT_RATE` (APG 223's 3.8%). */
  creditCardAssessmentRate?: number;
  /** Multiplier applied to the HEM benchmark, e.g. 1.10 for a lender that
   *  loads it. Defaults to 1. Only ever raises the living-expense floor. */
  hemLoading?: number;
  /** Assessment-rate floor, %. Assessed at max(rate + buffer, floor).
   *  Defaults to 0 (no floor), preserving existing behaviour. */
  assessmentFloorRate?: number;
};

export type CapacityResult = {
  taxYear: TaxYear;
  applicantTax: PersonalTax;
  partnerTax: PersonalTax;
  medicareLevy: number;
  monthlyNet: number;
  grossHousehold: number;
  /** Gross income including gross rents — the DTI denominator. */
  dtiIncome: number;

  hem: number;
  livingExp: number;

  assessed: AssessedProperty[];
  portfolioNetMonthly: number;
  portfolioRepayments: number;
  portfolioRent: number;
  portfolioCosts: number;
  portfolioDebt: number;
  portfolioEquity: number;

  /** Deductible rental losses actually recognised, annual. */
  deductibleLoss: number;
  /** Losses disallowed by the new-build restriction, annual. */
  disallowedLoss: number;
  /** Monthly tax saved by the recognised losses — the negative-gearing benefit. */
  negativeGearingBenefitMonthly: number;

  newPropertyMonthlyRent: number;
  newPropertyTaxLoss: number;
  consumerDebtCommit: number;
  surplus: number;

  maxLoanByServicing: number;
  maxLoanByDti: number;
  maxLoan: number;
  bindingConstraint: "servicing" | "dti" | "none";
  dtiAtMax: number;
  /** True if the negative-gearing fixed point failed to settle. */
  converged: boolean;

  purchasePrice: number;
  stampDuty: number;
  depositShortfall: number;
  lvr: number;
  lmiRate: number;
  lmiPremium: number;
  needsLmi: boolean;
};

/** Everything that doesn't depend on the size of the new loan. */
function assessAtLoan(i: CapacityInputs, newLoan: number) {
  const year = i.taxYear;
  const rentShading = i.rentShading ?? DEFAULT_RENT_SHADING;

  // Portfolio
  const assessed = i.properties.map((p) => assessProperty(p, i.buffer, rentShading, year));
  const portfolioRent = assessed.reduce((s, a) => s + a.assessedMonthlyRent, 0);
  const portfolioRepayments = assessed.reduce((s, a) => s + a.monthlyRepayment, 0);
  // Costs are still rolled up for the tax/NG view and for reporting, but they
  // are NOT deducted from servicing — the 80% rent shade already covers them.
  const portfolioCosts = assessed.reduce((s, a) => s + a.monthlyCosts, 0);
  const portfolioNetMonthly = portfolioRent - portfolioRepayments;
  const portfolioDebt = i.properties.reduce((s, p) => s + Math.max(0, p.loanBalance), 0);
  const portfolioEquity = assessed.reduce((s, a) => s + a.equity, 0);
  const portfolioGrossAnnualRent = assessed.reduce((s, a) => s + a.grossMonthlyRent * 12, 0);

  // The property being bought. Its interest — and therefore its tax loss —
  // depends on the loan we're solving for. Running costs use the rent-based
  // estimate; the purchase price isn't known until the loan is.
  const newGrossAnnualRent = Math.max(0, i.newWeeklyRent) * 52;
  const newIsInvestment = newGrossAnnualRent > 0;
  const newInterest = Math.max(0, newLoan) * (i.rate / 100);
  const newCosts = newGrossAnnualRent * AUTO_COST_RENT_RATIO;
  const newPropertyTaxLoss = newIsInvestment
    ? Math.max(0, newInterest + newCosts - newGrossAnnualRent)
    : 0;
  const newNgOk =
    newIsInvestment &&
    negativeGearingAllowed(
      // Bought today → not grandfathered. Only a new build survives the reform.
      { heldBeforeNgCutoff: false, isNewBuild: i.newPropertyIsNewBuild },
      year,
    );

  // Recognised vs disallowed losses
  let deductibleLoss = 0;
  let disallowedLoss = 0;
  for (const a of assessed) {
    if (a.annualTaxLoss <= 0) continue;
    if (a.negativeGearingAllowed) deductibleLoss += a.annualTaxLoss;
    else disallowedLoss += a.annualTaxLoss;
  }
  if (newPropertyTaxLoss > 0) {
    if (newNgOk) deductibleLoss += newPropertyTaxLoss;
    else disallowedLoss += newPropertyTaxLoss;
  }
  if (!i.negativeGearing) {
    disallowedLoss += deductibleLoss;
    deductibleLoss = 0;
  }

  // Losses attach to the title holder. Investors title in the higher earner's
  // name to deduct at the top marginal rate, so that's what we assume.
  const applicantIsHigher = i.income >= i.partner;
  const commonOpts = { year, claimsStandardDeduction: i.claimsStandardDeduction };
  const applicantTax = personalTax(i.income, {
    ...commonOpts,
    hasHecs: i.hasHecs,
    hecsBalance: i.hecsBalance,
    investmentLoss: applicantIsHigher ? deductibleLoss : 0,
  });
  const partnerTax = personalTax(i.partner, {
    ...commonOpts,
    hasHecs: i.partnerHasHecs,
    hecsBalance: i.partnerHecsBalance,
    investmentLoss: applicantIsHigher ? 0 : deductibleLoss,
  });

  // Medicare is a household charge on family taxable income, assessed once.
  const isFamily = i.partner > 0 || i.dependents > 0;
  const levy = medicareLevy(
    {
      familyTaxableIncome: applicantTax.taxableIncome + partnerTax.taxableIncome,
      dependents: i.dependents,
      isFamily,
    },
    year,
  );

  const netAnnual =
    applicantTax.netBeforeMedicare +
    partnerTax.netBeforeMedicare +
    i.otherIncome * OTHER_INCOME_SHADING -
    levy;
  const monthlyNet = netAnnual / 12;

  // Living expenses — HEM floor
  const adults: 1 | 2 = i.partner > 0 ? 2 : 1;
  const grossHousehold = i.income + i.partner + i.otherIncome + portfolioGrossAnnualRent;
  // A lender-specific loading only ever RAISES the benchmark floor, so a
  // missing or nonsensical value falls back to the unloaded HEM.
  const hemLoading = i.hemLoading && i.hemLoading > 1 ? i.hemLoading : 1;
  const hem = hemMonthly(adults, i.dependents, grossHousehold) * hemLoading;
  const livingExp = Math.max(hem, i.declaredExpenses);

  // Consumer debt
  const cardRate =
    typeof i.creditCardAssessmentRate === "number" && i.creditCardAssessmentRate > 0
      ? i.creditCardAssessmentRate
      : CREDIT_CARD_ASSESSMENT_RATE;
  const consumerDebtCommit =
    Math.max(0, i.creditLimit) * cardRate +
    Math.max(0, i.personalLoan) +
    Math.max(0, i.carLoan) +
    Math.max(0, i.otherDebts);

  // Surplus → servicing capacity. The new property is treated like every
  // existing investment: shaded rent in, stressed repayment (via
  // maxLoanByServicing) out. Holding costs are NOT subtracted — the 80% shade
  // already embeds them, so deducting them again would be a double-dip.
  // `newCosts` still feeds `newPropertyTaxLoss` for the negative-gearing view.
  const newPropertyMonthlyRent = (newGrossAnnualRent * rentShading) / 12;
  const surplus =
    monthlyNet +
    portfolioNetMonthly +
    newPropertyMonthlyRent -
    livingExp -
    consumerDebtCommit;

  // Most lenders assess at rate + buffer, but several also publish an absolute
  // assessment-rate FLOOR and use whichever is higher. Default floor is 0, so
  // this is a no-op unless a lender policy supplies one.
  const stressRate = Math.max(i.rate + i.buffer, i.assessmentFloorRate ?? 0);
  const maxLoanByServicing = surplus > 0 ? loanFromMonthly(surplus, stressRate, i.loanTerm) : 0;

  // DTI. Numerator is total debt including the new loan, existing mortgage
  // balances, credit card LIMITS at face value, and consumer loan balances.
  const existingDebt =
    portfolioDebt + Math.max(0, i.creditLimit) + Math.max(0, i.consumerDebtBalance);
  const dtiIncome =
    i.income + i.partner + i.otherIncome + portfolioGrossAnnualRent + newGrossAnnualRent;
  const maxLoanByDti = Math.max(0, i.dtiCap * dtiIncome - existingDebt);

  const maxLoan = Math.max(0, Math.min(maxLoanByServicing, maxLoanByDti));

  return {
    assessed,
    portfolioRent,
    portfolioRepayments,
    portfolioCosts,
    portfolioNetMonthly,
    portfolioDebt,
    portfolioEquity,
    deductibleLoss,
    disallowedLoss,
    applicantTax,
    partnerTax,
    applicantIsHigher,
    levy,
    monthlyNet,
    grossHousehold,
    hem,
    livingExp,
    consumerDebtCommit,
    newPropertyMonthlyRent,
    newPropertyTaxLoss,
    surplus,
    maxLoanByServicing,
    maxLoanByDti,
    maxLoan,
    existingDebt,
    dtiIncome,
  };
}

export function computeCapacity(i: CapacityInputs): CapacityResult {
  // The new property's tax loss depends on its interest, which depends on the
  // loan we're solving for. Each extra dollar of loan adds ~rate × marginal
  // ≈ 2.5c of tax saving, worth ~26c of further capacity — a contraction, so
  // this settles in a few passes. Without negative gearing the first pass is
  // already exact.
  let newLoan = 0;
  let pass = assessAtLoan(i, newLoan);
  let converged = true;

  if (i.negativeGearing && i.newWeeklyRent > 0) {
    converged = false;
    for (let n = 0; n < 40; n++) {
      const next = pass.maxLoan;
      if (Math.abs(next - newLoan) < 100) {
        converged = true;
        break;
      }
      newLoan = next;
      pass = assessAtLoan(i, newLoan);
    }
  }

  const {
    assessed,
    portfolioRent,
    portfolioRepayments,
    portfolioCosts,
    portfolioNetMonthly,
    portfolioDebt,
    portfolioEquity,
    deductibleLoss,
    disallowedLoss,
    applicantTax,
    partnerTax,
    applicantIsHigher,
    levy,
    monthlyNet,
    grossHousehold,
    hem,
    livingExp,
    consumerDebtCommit,
    newPropertyMonthlyRent,
    newPropertyTaxLoss,
    surplus,
    maxLoanByServicing,
    maxLoanByDti,
    maxLoan,
    existingDebt,
    dtiIncome,
  } = pass;

  // What the recognised losses are actually worth, at the deducting party's
  // marginal rate (measured before the deduction, on the top slice).
  const deductingGross = applicantIsHigher ? i.income : i.partner;
  const negativeGearingBenefitMonthly =
    (deductibleLoss * marginalTaxRate(deductingGross, i.taxYear)) / 12;

  const bindingConstraint: CapacityResult["bindingConstraint"] =
    maxLoan <= 0 ? "none" : maxLoanByDti < maxLoanByServicing ? "dti" : "servicing";
  const dtiAtMax = dtiIncome > 0 ? (maxLoan + existingDebt) / dtiIncome : 0;

  const { purchasePrice, duty, shortfall } = solvePurchasePrice({
    maxLoan,
    deposit: i.deposit,
    state: i.state,
    isFhb: i.isFhb,
    closingCosts: Math.max(0, i.closingCosts),
  });

  const lvr = purchasePrice > 0 ? (maxLoan / purchasePrice) * 100 : 0;
  const lmiRate = lmiRateForLvr(lvr);
  const lmiPremium = lmiRate * maxLoan;
  const needsLmi = lvr > 80 && maxLoan > 0 && i.deposit > 0;

  return {
    taxYear: i.taxYear,
    applicantTax,
    partnerTax,
    medicareLevy: levy,
    monthlyNet,
    grossHousehold,
    dtiIncome,
    hem,
    livingExp,
    assessed,
    portfolioNetMonthly,
    portfolioRepayments,
    portfolioRent,
    portfolioCosts,
    portfolioDebt,
    portfolioEquity,
    deductibleLoss,
    disallowedLoss,
    negativeGearingBenefitMonthly,
    newPropertyMonthlyRent,
    newPropertyTaxLoss,
    consumerDebtCommit,
    surplus,
    maxLoanByServicing,
    maxLoanByDti,
    maxLoan,
    bindingConstraint,
    dtiAtMax,
    converged,
    purchasePrice,
    stampDuty: duty,
    depositShortfall: shortfall,
    lvr,
    lmiRate,
    lmiPremium,
    needsLmi,
  };
}
