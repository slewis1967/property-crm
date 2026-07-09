/**
 * Australian personal tax primitives used by the borrowing-capacity
 * calculator. Pure functions, no React — unit-tested in `tax.test.ts`.
 *
 * Scope: resident individuals, PAYG. Deliberately does NOT model
 * Medicare levy surcharge, private health rebate, family Medicare
 * thresholds, offsets other than LITO, or reportable fringe benefits.
 * Lenders don't model most of those either when shading income.
 */

/** Resident income tax, 2024-25 / 2025-26 brackets (Stage 3). Excludes Medicare. */
export function incomeTax(taxable: number): number {
  if (taxable <= 18200) return 0;
  if (taxable <= 45000) return (taxable - 18200) * 0.16;
  if (taxable <= 135000) return 4288 + (taxable - 45000) * 0.3;
  if (taxable <= 190000) return 31288 + (taxable - 135000) * 0.37;
  return 51638 + (taxable - 190000) * 0.45;
}

/**
 * Low Income Tax Offset. Reduces tax payable but never below zero, and
 * never reduces the Medicare levy — both handled by the caller.
 */
export function lito(taxable: number): number {
  if (taxable <= 37500) return 700;
  if (taxable <= 45000) return 700 - (taxable - 37500) * 0.05;
  if (taxable <= 66667) return Math.max(0, 325 - (taxable - 45000) * 0.015);
  return 0;
}

// Medicare levy low-income thresholds (singles, 2024-25). Between the two
// the levy shades in at 10c per dollar over the lower threshold, which is
// exactly 2% of income at the upper threshold (upper = lower / 0.8).
export const MEDICARE_LOWER_SINGLE = 27222;
export const MEDICARE_UPPER_SINGLE = 34027;

/**
 * Medicare levy with the shade-in range applied. Uses the singles
 * threshold per person — the family threshold (higher, and stepped by
 * dependent) would need family-income apportionment we don't model.
 * Slightly conservative for low-income couples with kids.
 */
export function medicareLevy(income: number): number {
  if (income <= MEDICARE_LOWER_SINGLE) return 0;
  if (income >= MEDICARE_UPPER_SINGLE) return income * 0.02;
  return (income - MEDICARE_LOWER_SINGLE) * 0.1;
}

/**
 * HECS/HELP compulsory repayment under the marginal system that applies
 * from the 2025-26 income year: nothing on the first $67,000, 15c in the
 * dollar to $125,000, 17c above that. This replaced the old cliff-edge
 * "% of whole income" scale, which overstated repayments — materially so
 * for borrowers just over a threshold.
 *
 * Takes repayment income; we pass gross, which is a close proxy (real
 * repayment income adds back net investment losses and reportable fringe
 * benefits — both of which push it up, so this is slightly generous).
 */
export const HECS_FREE_THRESHOLD = 67000;
export const HECS_SECOND_THRESHOLD = 125000;

export function hecsRepayment(repaymentIncome: number): number {
  if (repaymentIncome <= HECS_FREE_THRESHOLD) return 0;
  if (repaymentIncome <= HECS_SECOND_THRESHOLD) {
    return (repaymentIncome - HECS_FREE_THRESHOLD) * 0.15;
  }
  return 8700 + (repaymentIncome - HECS_SECOND_THRESHOLD) * 0.17;
}

/** Repayment as a share of income — for UI labels only. */
export function hecsEffectiveRate(income: number): number {
  return income > 0 ? hecsRepayment(income) / income : 0;
}

export type NetIncomeOpts = {
  hasHecs?: boolean;
  /** Outstanding HELP balance. Repayment is capped at what's left owing. */
  hecsBalance?: number | null;
};

export type NetIncomeBreakdown = {
  gross: number;
  tax: number;
  litoOffset: number;
  medicare: number;
  hecs: number;
  net: number;
};

/** Annual take-home after tax, LITO, Medicare levy and any HECS repayment. */
export function netIncome(gross: number, opts: NetIncomeOpts = {}): NetIncomeBreakdown {
  if (gross <= 0) {
    return { gross: 0, tax: 0, litoOffset: 0, medicare: 0, hecs: 0, net: 0 };
  }
  const rawTax = incomeTax(gross);
  const offset = Math.min(lito(gross), rawTax);
  const tax = rawTax - offset;
  const medicare = medicareLevy(gross);

  let hecs = 0;
  if (opts.hasHecs) {
    hecs = hecsRepayment(gross);
    if (opts.hecsBalance != null && opts.hecsBalance >= 0) {
      hecs = Math.min(hecs, opts.hecsBalance);
    }
  }

  return { gross, tax, litoOffset: offset, medicare, hecs, net: gross - tax - medicare - hecs };
}

/** Convenience: just the net figure. */
export function netAfterTax(gross: number, opts: NetIncomeOpts = {}): number {
  return netIncome(gross, opts).net;
}

/** Principal & interest monthly repayment. */
export function pAndIMonthly(balance: number, ratePct: number, years: number): number {
  if (balance <= 0 || years <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

/** Loan principal that a given monthly payment supports (inverse of pAndIMonthly). */
export function loanFromMonthly(monthly: number, ratePct: number, years: number): number {
  if (monthly <= 0 || years <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return monthly * n;
  return (monthly * (1 - Math.pow(1 + r, -n))) / r;
}
