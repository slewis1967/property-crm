/**
 * Australian personal tax primitives used by the borrowing-capacity
 * calculator. Pure functions, no React — unit-tested in `tax.test.ts`.
 *
 * TAX YEAR AWARE. Three schedules are currently in play because two
 * separate reform packages are now law:
 *
 *   - Treasury Laws Amendment (More Cost of Living Relief) Act 2025 cuts the
 *     lowest marginal rate from 16% → 15% on 1 Jul 2026, then 15% → 14% on
 *     1 Jul 2027.
 *   - Treasury Laws Amendment (Tax Reform No. 1) Act 2026 introduces the
 *     $1,000 standard work-expense deduction from 1 Jul 2026, and restricts
 *     negative gearing from 1 Jul 2027 (see `capacity.ts`).
 *
 * So the assessed net income of the same borrower differs by year, and an
 * advisor modelling a 2027-28 settlement needs the 2027-28 schedule.
 *
 * Scope: resident individuals, PAYG. Does NOT model the Medicare levy
 * surcharge, private health rebate, SAPTO, or offsets other than LITO.
 * Lenders don't model most of those when shading income either.
 *
 * Sources (verified 2026-07-09):
 *   ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
 *   ato.gov.au/about-ato/new-legislation/in-detail/individuals/
 *     personal-income-tax-new-tax-cuts-for-every-australian-taxpayer
 *   ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds
 *   ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/
 *     medicare-levy/medicare-levy-reduction/...
 */

export type TaxYear = "2025-26" | "2026-27" | "2027-28";

/** The income year a settlement today falls in. */
export const CURRENT_TAX_YEAR: TaxYear = "2026-27";

export const TAX_YEARS: TaxYear[] = ["2025-26", "2026-27", "2027-28"];

// ─── Income tax ────────────────────────────────────────────────────────────
//
// [upper bound, cumulative tax at the previous bound, marginal rate above it]

type Bracket = [upper: number, base: number, rate: number];

const BRACKETS: Record<TaxYear, Bracket[]> = {
  // 16c bracket
  "2025-26": [
    [18200, 0, 0],
    [45000, 0, 0.16],
    [135000, 4288, 0.3],
    [190000, 31288, 0.37],
    [Infinity, 51638, 0.45],
  ],
  // 16c → 15c from 1 Jul 2026. Bases fall out of the rate change:
  // 26,800 × 0.15 = 4,020; +90,000 × 0.30 = 31,020; +55,000 × 0.37 = 51,370.
  "2026-27": [
    [18200, 0, 0],
    [45000, 0, 0.15],
    [135000, 4020, 0.3],
    [190000, 31020, 0.37],
    [Infinity, 51370, 0.45],
  ],
  // 15c → 14c from 1 Jul 2027. 26,800 × 0.14 = 3,752.
  "2027-28": [
    [18200, 0, 0],
    [45000, 0, 0.14],
    [135000, 3752, 0.3],
    [190000, 30752, 0.37],
    [Infinity, 51102, 0.45],
  ],
};

/** Resident income tax on taxable income. Excludes the Medicare levy. */
export function incomeTax(taxable: number, year: TaxYear = CURRENT_TAX_YEAR): number {
  if (taxable <= 0) return 0;
  let prevUpper = 0;
  for (const [upper, base, rate] of BRACKETS[year]) {
    if (taxable <= upper) return base + (taxable - prevUpper) * rate;
    prevUpper = upper;
  }
  return 0;
}

/** Top marginal rate applying to the next dollar, optionally incl. Medicare. */
export function marginalTaxRate(
  taxable: number,
  year: TaxYear = CURRENT_TAX_YEAR,
  includeMedicare = true,
): number {
  if (taxable <= 0) return 0;
  let rate = 0;
  for (const [upper, , r] of BRACKETS[year]) {
    if (taxable <= upper) {
      rate = r;
      break;
    }
  }
  const med = includeMedicare && taxable > MEDICARE[year].singleUpper ? 0.02 : 0;
  return rate + med;
}

// ─── Standard deduction ────────────────────────────────────────────────────
//
// $1,000 instant deduction for work-related expenses, from 1 Jul 2026. Applies
// to people earning work income; those with >$1,000 of real work expenses claim
// the real amount instead, and those on purely business/investment income get
// nothing. We model the flat claim, which is what a PAYG borrower gets.

export const STANDARD_DEDUCTION: Record<TaxYear, number> = {
  "2025-26": 0,
  "2026-27": 1000,
  "2027-28": 1000,
};

export function standardDeduction(year: TaxYear = CURRENT_TAX_YEAR): number {
  return STANDARD_DEDUCTION[year];
}

// ─── LITO ──────────────────────────────────────────────────────────────────
//
// Unchanged by the rate cuts. Reduces tax payable but never below zero, and
// never reduces the Medicare levy — both enforced by the caller.

export function lito(taxable: number): number {
  if (taxable <= 37500) return 700;
  if (taxable <= 45000) return 700 - (taxable - 37500) * 0.05;
  if (taxable <= 66667) return Math.max(0, 325 - (taxable - 45000) * 0.015);
  return 0;
}

// ─── Medicare levy ─────────────────────────────────────────────────────────
//
// The levy is a HOUSEHOLD calculation, not a per-person one: a couple, or a
// single person with a dependent, is assessed against the family threshold on
// combined family taxable income. Modelling it per-person on the singles
// threshold (as this calculator used to) overstates the levy for low-income
// families.
//
// Between the lower and upper thresholds the levy shades in at 10c per dollar
// over the lower bound, which lands exactly on 2% at the upper bound — the
// upper is defined as lower ÷ 0.8.
//
// NOTE: the 2026-27 thresholds are not published yet (the ATO indexes them and
// announces with the Budget). 2025-26 figures are carried forward, so a
// borrower within ~$8k of the threshold may be assessed a few dollars out.
// Immaterial to capacity — the levy is 2% flat well before any borrowing.

type MedicareThresholds = {
  singleLower: number;
  singleUpper: number;
  familyLower: number;
  familyUpper: number;
  perChildLower: number;
  perChildUpper: number;
};

const MEDICARE_2025_26: MedicareThresholds = {
  singleLower: 28011,
  singleUpper: 35013,
  familyLower: 47238,
  familyUpper: 59047,
  perChildLower: 4338,
  perChildUpper: 5423,
};

export const MEDICARE: Record<TaxYear, MedicareThresholds> = {
  "2025-26": MEDICARE_2025_26,
  "2026-27": MEDICARE_2025_26, // not yet published — see NOTE above
  "2027-28": MEDICARE_2025_26,
};

export const MEDICARE_RATE = 0.02;
const MEDICARE_SHADE_IN_RATE = 0.1;

export type MedicareHousehold = {
  /** Combined taxable income of the borrower and their spouse. */
  familyTaxableIncome: number;
  dependents: number;
  /** True if the borrower has a spouse OR maintains a dependent child. */
  isFamily: boolean;
};

/**
 * Total household Medicare levy. Returns one number for the household, which
 * the caller subtracts once — do not call this per applicant.
 */
export function medicareLevy(
  h: MedicareHousehold,
  year: TaxYear = CURRENT_TAX_YEAR,
): number {
  const t = MEDICARE[year];
  const income = Math.max(0, h.familyTaxableIncome);
  if (income <= 0) return 0;

  const kids = Math.max(0, h.dependents);
  const lower = h.isFamily ? t.familyLower + kids * t.perChildLower : t.singleLower;
  const upper = h.isFamily ? t.familyUpper + kids * t.perChildUpper : t.singleUpper;

  if (income <= lower) return 0;
  if (income >= upper) return income * MEDICARE_RATE;
  return (income - lower) * MEDICARE_SHADE_IN_RATE;
}

// ─── HECS / HELP ───────────────────────────────────────────────────────────
//
// The marginal repayment system replaced the old "% of your whole income"
// scale from 2025-26. Three bands: a repayment-free threshold, 15c then 17c
// on the excess, and then — above a top threshold — a flat 10% of TOTAL
// repayment income, not of the excess.
//
// Repayment income is taxable income plus add-backs, the relevant one here
// being net investment (rental) losses. `capacity.ts` passes those in, which
// is why a negatively geared borrower repays MORE HELP, not less.

type HecsScale = {
  free: number;
  /** Top of the 15c band. */
  band15Upper: number;
  /** Cumulative repayment at `band15Upper`. */
  band17Base: number;
  /** Above this, repayment is a flat 10% of total repayment income. */
  flatFrom: number;
};

const HECS: Record<TaxYear, HecsScale> = {
  "2025-26": { free: 67000, band15Upper: 125000, band17Base: 8700, flatFrom: 179285 },
  "2026-27": { free: 69528, band15Upper: 129717, band17Base: 9028, flatFrom: 186050 },
  // 2027-28 thresholds are indexed and not published. Carried forward; the
  // figures will be low by roughly one year of indexation.
  "2027-28": { free: 69528, band15Upper: 129717, band17Base: 9028, flatFrom: 186050 },
};

export function hecsRepayment(
  repaymentIncome: number,
  year: TaxYear = CURRENT_TAX_YEAR,
): number {
  const s = HECS[year];
  if (repaymentIncome <= s.free) return 0;
  if (repaymentIncome <= s.band15Upper) return (repaymentIncome - s.free) * 0.15;
  if (repaymentIncome <= s.flatFrom) {
    return s.band17Base + (repaymentIncome - s.band15Upper) * 0.17;
  }
  return repaymentIncome * 0.1;
}

/** Repayment as a share of income — for UI labels only. */
export function hecsEffectiveRate(income: number, year: TaxYear = CURRENT_TAX_YEAR): number {
  return income > 0 ? hecsRepayment(income, year) / income : 0;
}

// ─── Per-applicant assessment ──────────────────────────────────────────────

export type PersonalTaxOpts = {
  year?: TaxYear;
  hasHecs?: boolean;
  /** Outstanding HELP balance. The compulsory repayment is capped at it. */
  hecsBalance?: number | null;
  /** Whether to apply the $1,000 standard work-expense deduction. */
  claimsStandardDeduction?: boolean;
  /** Rental/investment losses attributable to this applicant. Reduces taxable
   *  income, but is ADDED BACK for HELP repayment income. */
  investmentLoss?: number;
};

export type PersonalTax = {
  gross: number;
  deductions: number;
  taxableIncome: number;
  tax: number;
  litoOffset: number;
  hecs: number;
  /** Gross less tax and HECS. Medicare is a household charge, deducted by the
   *  caller — this figure is deliberately BEFORE it. */
  netBeforeMedicare: number;
};

/**
 * Tax, LITO and HELP for one applicant. Medicare is excluded on purpose: it
 * depends on family income and dependents, so `capacity.ts` computes it once
 * for the household via `medicareLevy`.
 */
export function personalTax(gross: number, opts: PersonalTaxOpts = {}): PersonalTax {
  const year = opts.year ?? CURRENT_TAX_YEAR;
  if (gross <= 0) {
    return {
      gross: 0,
      deductions: 0,
      taxableIncome: 0,
      tax: 0,
      litoOffset: 0,
      hecs: 0,
      netBeforeMedicare: 0,
    };
  }

  const investmentLoss = Math.max(0, opts.investmentLoss ?? 0);
  const stdDeduction = opts.claimsStandardDeduction ? standardDeduction(year) : 0;
  const deductions = stdDeduction + investmentLoss;
  const taxable = Math.max(0, gross - deductions);

  const rawTax = incomeTax(taxable, year);
  const litoOffset = Math.min(lito(taxable), rawTax);
  const tax = rawTax - litoOffset;

  // HELP repayment income adds net investment losses back. A negatively geared
  // borrower does not get a HELP discount for the loss.
  const repaymentIncome = taxable + investmentLoss;
  let hecs = 0;
  if (opts.hasHecs) {
    hecs = hecsRepayment(repaymentIncome, year);
    if (opts.hecsBalance != null && opts.hecsBalance >= 0) {
      hecs = Math.min(hecs, opts.hecsBalance);
    }
  }

  return {
    gross,
    deductions,
    taxableIncome: taxable,
    tax,
    litoOffset,
    hecs,
    netBeforeMedicare: gross - tax - hecs,
  };
}

// ─── Loan arithmetic ───────────────────────────────────────────────────────

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
