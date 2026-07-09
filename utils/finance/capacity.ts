/**
 * Borrowing-capacity engine — pure, no React. Unit-tested in `capacity.test.ts`.
 *
 * Models what an Australian lender's servicing calculator actually does:
 *
 *   1. Net income      — PAYG tax + LITO + Medicare shade-in + HECS marginal
 *                        repayment, per applicant; "other" income shaded.
 *   2. Portfolio       — every existing property contributes shaded rent and
 *                        subtracts its stressed repayment + holding costs.
 *   3. Living expenses — max(declared, HEM benchmark).
 *   4. Consumer debt   — card limits at 3.8%/month (APG 223), plus stated
 *                        monthly personal/car/other commitments.
 *   5. Capacity        — surplus capitalised at the assessment rate (rate +
 *                        APRA's +3% buffer), then CAPPED BY DTI.
 *   6. Purchase price  — deposit net of stamp duty + closing costs, solved
 *                        as a fixed point because duty depends on the price.
 *
 * Everything here is indicative. Lender policy (postcode caps, casual-income
 * shading, FBT grossing, negative-gearing add-backs) varies materially.
 */

import { netIncome, pAndIMonthly, loanFromMonthly, type NetIncomeBreakdown } from "./tax";
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

// ─── Existing properties ───────────────────────────────────────────────────

export type PropertyUse = "owner_occupied" | "investment";

export type ExistingProperty = {
  id: string;
  label: string;
  use: PropertyUse;
  /** Current market value. Used for portfolio LVR and to floor auto costs. */
  value: number;
  loanBalance: number;
  /** Current interest rate, %. Assessed at rate + buffer. */
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
   * Leave at 0 (or set `autoCosts`) and the engine estimates it.
   */
  annualCosts: number;
  /** When true, `annualCosts` is ignored and the estimate is used. */
  autoCosts: boolean;
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
  /** assessedRent − repayment − costs. Negative = the property drags capacity. */
  netMonthly: number;
  equity: number;
};

export function assessProperty(
  p: ExistingProperty,
  buffer: number,
  rentShading: number,
): AssessedProperty {
  const amortYears = p.interestOnly
    ? Math.max(1, p.termRemaining - Math.max(0, p.ioYearsRemaining))
    : p.termRemaining;

  const monthlyRepayment = pAndIMonthly(p.loanBalance, p.rate + buffer, amortYears);

  const grossMonthlyRent = (Math.max(0, p.weeklyRent) * 52) / 12;
  const assessedMonthlyRent =
    p.use === "investment" ? grossMonthlyRent * rentShading : 0;

  const costsWereEstimated = p.autoCosts;
  const annualCosts = costsWereEstimated ? autoAnnualCosts(p) : Math.max(0, p.annualCosts);
  const monthlyCosts = annualCosts / 12;

  return {
    id: p.id,
    label: p.label,
    use: p.use,
    monthlyRepayment,
    grossMonthlyRent,
    assessedMonthlyRent,
    monthlyCosts,
    costsWereEstimated,
    netMonthly: assessedMonthlyRent - monthlyRepayment - monthlyCosts,
    equity: Math.max(0, p.value - p.loanBalance),
  };
}

// ─── Purchase price with duty + costs netted out ───────────────────────────

/**
 * Deposit has to pay stamp duty and closing costs before any of it lands on
 * the purchase price — but duty is a function of the price, so this is a
 * fixed point. Duty's marginal rate is ~5%, making `price = loan + deposit −
 * duty(price) − costs` a contraction; it converges in a handful of passes.
 *
 * Returns a negative-safe price; `shortfall` is set when the deposit can't
 * even cover duty + costs.
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
  // Income
  income: number;
  partner: number;
  otherIncome: number;
  hasHecs: boolean;
  partnerHasHecs: boolean;
  hecsBalance?: number | null;
  partnerHecsBalance?: number | null;

  // Household
  dependents: number;
  declaredExpenses: number;

  // Deposit + purchase
  deposit: number;
  state: AusState;
  isFhb: boolean;
  closingCosts: number;

  // New property income (0 for owner-occupied)
  newWeeklyRent: number;

  // Existing portfolio
  properties: ExistingProperty[];

  // Consumer debt
  creditLimit: number;
  personalLoan: number;
  carLoan: number;
  otherDebts: number;

  // Loan parameters
  rate: number;
  buffer: number;
  loanTerm: number;
  rentShading: number;
  dtiCap: number;
};

export type CapacityResult = {
  applicantNet: NetIncomeBreakdown;
  partnerNet: NetIncomeBreakdown;
  monthlyNet: number;
  grossHousehold: number;
  /** Gross income including shaded rents — the DTI denominator. */
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

  newPropertyMonthlyRent: number;
  consumerDebtCommit: number;
  surplus: number;

  maxLoanByServicing: number;
  maxLoanByDti: number;
  maxLoan: number;
  /** Which constraint bound the result. */
  bindingConstraint: "servicing" | "dti" | "none";
  dtiAtMax: number;

  purchasePrice: number;
  stampDuty: number;
  depositShortfall: number;
  lvr: number;
  lmiRate: number;
  lmiPremium: number;
  needsLmi: boolean;
};

export function computeCapacity(i: CapacityInputs): CapacityResult {
  const rentShading = i.rentShading ?? DEFAULT_RENT_SHADING;

  // 1. Personal net income
  const applicantNet = netIncome(i.income, { hasHecs: i.hasHecs, hecsBalance: i.hecsBalance });
  const partnerNet = netIncome(i.partner, {
    hasHecs: i.partnerHasHecs,
    hecsBalance: i.partnerHecsBalance,
  });
  const netAnnual = applicantNet.net + partnerNet.net + i.otherIncome * OTHER_INCOME_SHADING;
  const monthlyNet = netAnnual / 12;

  // 2. Portfolio
  const assessed = i.properties.map((p) => assessProperty(p, i.buffer, rentShading));
  const portfolioRent = assessed.reduce((s, a) => s + a.assessedMonthlyRent, 0);
  const portfolioRepayments = assessed.reduce((s, a) => s + a.monthlyRepayment, 0);
  const portfolioCosts = assessed.reduce((s, a) => s + a.monthlyCosts, 0);
  const portfolioNetMonthly = portfolioRent - portfolioRepayments - portfolioCosts;
  const portfolioDebt = i.properties.reduce((s, p) => s + Math.max(0, p.loanBalance), 0);
  const portfolioEquity = assessed.reduce((s, a) => s + a.equity, 0);
  const portfolioGrossAnnualRent = assessed.reduce((s, a) => s + a.grossMonthlyRent * 12, 0);

  // 3. Living expenses — HEM floor
  const adults: 1 | 2 = i.partner > 0 ? 2 : 1;
  const grossHousehold = i.income + i.partner + i.otherIncome + portfolioGrossAnnualRent;
  const hem = hemMonthly(adults, i.dependents, grossHousehold);
  const livingExp = Math.max(hem, i.declaredExpenses);

  // 4. Consumer debt
  const consumerDebtCommit =
    Math.max(0, i.creditLimit) * CREDIT_CARD_ASSESSMENT_RATE +
    Math.max(0, i.personalLoan) +
    Math.max(0, i.carLoan) +
    Math.max(0, i.otherDebts);

  // 5. Surplus → servicing capacity
  const newPropertyMonthlyRent = (Math.max(0, i.newWeeklyRent) * 52 * rentShading) / 12;
  const surplus =
    monthlyNet + portfolioNetMonthly + newPropertyMonthlyRent - livingExp - consumerDebtCommit;

  const stressRate = i.rate + i.buffer;
  const maxLoanByServicing = surplus > 0 ? loanFromMonthly(surplus, stressRate, i.loanTerm) : 0;

  // DTI cap. Numerator is total debt INCLUDING the new loan; card limits count
  // at face value. Personal/car loans are captured as repayments not balances,
  // so they don't reach the numerator — DTI here is slightly optimistic.
  const existingDebt = portfolioDebt + Math.max(0, i.creditLimit);
  const dtiIncome = i.income + i.partner + i.otherIncome + portfolioGrossAnnualRent + Math.max(0, i.newWeeklyRent) * 52;
  const maxLoanByDti = Math.max(0, i.dtiCap * dtiIncome - existingDebt);

  const maxLoan = Math.max(0, Math.min(maxLoanByServicing, maxLoanByDti));
  const bindingConstraint: CapacityResult["bindingConstraint"] =
    maxLoan <= 0
      ? "none"
      : maxLoanByDti < maxLoanByServicing
        ? "dti"
        : "servicing";
  const dtiAtMax = dtiIncome > 0 ? (maxLoan + existingDebt) / dtiIncome : 0;

  // 6. Purchase price, net of duty + closing costs
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
    applicantNet,
    partnerNet,
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
    newPropertyMonthlyRent,
    consumerDebtCommit,
    surplus,
    maxLoanByServicing,
    maxLoanByDti,
    maxLoan,
    bindingConstraint,
    dtiAtMax,
    purchasePrice,
    stampDuty: duty,
    depositShortfall: shortfall,
    lvr,
    lmiRate,
    lmiPremium,
    needsLmi,
  };
}
