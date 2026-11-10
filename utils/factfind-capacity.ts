/**
 * Bridge: Borrower Fact Find → borrowing-capacity engine.
 *
 * Lives in its own module on purpose. `utils/finance/` knows nothing about the
 * fact find, and `utils/factfind.ts` knows nothing about servicing maths —
 * only this file depends on both, so neither side drags the other into its
 * bundle or its tests.
 *
 * The fact find is a credit-submission document, not a servicing calculator,
 * so the mapping is lossy in specific, named ways. Every lossy step either
 * degrades conservatively (understating capacity) or is reported in `missing`
 * / `notes` so the advisor can see what the number rests on.
 *
 * Pure. Tested in `utils/factfind-capacity.test.ts`.
 */

import type { FactFindData, Liability, SecurityProperty } from "./factfind";
import {
  CURRENT_TAX_YEAR,
  DEFAULT_CLOSING_COSTS,
  DEFAULT_DTI_CAP,
  DEFAULT_RENT_SHADING,
  emptyProperty,
  type AusState,
  type CapacityInputs,
  type ExistingProperty,
} from "./finance";

/** Assumptions the fact find cannot supply. Surfaced to the UI, not buried. */
export const ASSUMED_MORTGAGE_RATE = 6.5;
export const ASSUMED_MORTGAGE_TERM_YEARS = 25;
export const ASSUMED_NEW_LOAN_RATE = 6.5;
export const ASSUMED_BUFFER = 3;
export const ASSUMED_LOAN_TERM_YEARS = 30;

/** A field the capacity engine needs that the fact find hasn't captured. */
export type MissingField =
  | "applicant_income"
  | "living_expenses"
  | "dependents"
  | "purchase_state"
  | "deposit";

export type BridgeResult = {
  inputs: CapacityInputs;
  /** Empty when the fact find is complete enough to trust the number. */
  missing: MissingField[];
  /** Human-readable notes about lossy mappings that did happen. */
  notes: string[];
};

const n = (v: number | null | undefined): number =>
  typeof v === "number" && isFinite(v) ? v : 0;

// ─── Postcode → state ──────────────────────────────────────────────────────
//
// The fact find records a postcode on each security, not a state, but stamp
// duty is state-based. Standard Australia Post allocations.

export function stateFromPostcode(postcode: string): AusState | null {
  const p = Number(String(postcode).trim());
  if (!Number.isFinite(p) || p <= 0) return null;
  if (p >= 800 && p <= 899) return "NT";
  if (p >= 900 && p <= 999) return "NT";
  // ACT sits inside the NSW ranges — test it first.
  if ((p >= 2600 && p <= 2618) || (p >= 2900 && p <= 2920)) return "ACT";
  if (p >= 1000 && p <= 2999) return "NSW";
  if (p >= 3000 && p <= 3999) return "VIC";
  if (p >= 4000 && p <= 4999) return "QLD";
  if (p >= 5000 && p <= 5999) return "SA";
  if (p >= 6000 && p <= 6999) return "WA";
  if (p >= 7000 && p <= 7999) return "TAS";
  return null;
}

// ─── Security classification ───────────────────────────────────────────────

const isOwned = (s: SecurityProperty) => s.ownership === "Already owned";
const isPurchase = (s: SecurityProperty) => s.ownership === "Being purchased";
const isInvestment = (s: SecurityProperty) => s.use === "Investment property";

/** A security row with nothing filled in is a blank template slot, not a property. */
const isBlank = (s: SecurityProperty) =>
  !s.address.trim() && !s.suburb.trim() && s.estimated_value == null && s.rental_per_week == null;

// ─── Mortgage ↔ security pairing ───────────────────────────────────────────
//
// The form lists securities and liabilities as independent tables — a mortgage
// row names its lender, not the property it secures. We pair them positionally,
// which is how the form is filled in practice.
//
// Surplus mortgages (more mortgage rows than owned securities) do NOT get
// invented properties. Their repayments go to `otherDebts` and their balances
// to `consumerDebtBalance`, so servicing and DTI both stay correct; the only
// thing lost is the negative-gearing deduction, which fails conservatively
// (capacity is understated, never overstated).

function pairMortgages(owned: SecurityProperty[], mortgages: Liability[]) {
  const properties: ExistingProperty[] = owned.map((s, i) => {
    const m = mortgages[i];
    const p = emptyProperty(`ff-sec-${i}`, s.address.trim() || s.suburb.trim() || `Property ${i + 1}`);
    return {
      ...p,
      use: isInvestment(s) ? "investment" : "owner_occupied",
      value: n(s.estimated_value),
      loanBalance: m ? n(m.balance) : 0,
      rate: ASSUMED_MORTGAGE_RATE,
      termRemaining: ASSUMED_MORTGAGE_TERM_YEARS,
      weeklyRent: isInvestment(s) ? n(s.rental_per_week) : 0,
      autoCosts: true,
      // Already owned → held before the 12 May 2026 cutoff, so grandfathered.
      heldBeforeNgCutoff: true,
    };
  });

  const surplus = mortgages.slice(owned.length);
  return {
    properties,
    surplusMonthly: surplus.reduce((t, m) => t + n(m.monthly), 0),
    surplusBalance: surplus.reduce((t, m) => t + n(m.balance), 0),
    surplusCount: surplus.length,
  };
}

// ─── The bridge ────────────────────────────────────────────────────────────

export function factFindToCapacityInputs(
  data: FactFindData,
  overrides: Partial<CapacityInputs> = {},
): BridgeResult {
  const missing: MissingField[] = [];
  const notes: string[] = [];

  // Income. Applicant 2 is the partner; a solo borrower leaves it blank.
  const [a1, a2] = data.applicants;
  const income = n(a1.annual_income);
  const partner = n(a2.annual_income);
  if (income <= 0 && partner <= 0) missing.push("applicant_income");

  // Securities
  const live = data.securities.filter((s) => !isBlank(s));
  const owned = live.filter(isOwned);
  const purchases = live.filter(isPurchase);
  if (purchases.length > 1) {
    notes.push(
      `${purchases.length} securities are marked "Being purchased" — only the first is priced.`,
    );
  }
  const purchase = purchases[0];

  // Liabilities. A credit card's "balance" is its LIMIT on this form, which is
  // exactly what the engine assesses at 3.8%/month.
  const liabs = data.financials.liabilities;
  const kind = (k: Liability["kind"]) => liabs.filter((l) => l.kind === k);

  const creditLimit = kind("Credit card").reduce((t, l) => t + n(l.balance), 0);
  const carLoan = kind("Car lease").reduce((t, l) => t + n(l.monthly), 0);
  const otherMonthly =
    kind("Other loan").reduce((t, l) => t + n(l.monthly), 0) +
    kind("Overdraft").reduce((t, l) => t + n(l.monthly), 0);
  const consumerBalances =
    kind("Car lease").reduce((t, l) => t + n(l.balance), 0) +
    kind("Other loan").reduce((t, l) => t + n(l.balance), 0) +
    kind("Overdraft").reduce((t, l) => t + n(l.balance), 0);

  const mortgages = kind("Mortgage").filter((l) => n(l.balance) > 0 || n(l.monthly) > 0);
  const { properties, surplusMonthly, surplusBalance, surplusCount } = pairMortgages(
    owned,
    mortgages,
  );
  if (surplusCount > 0) {
    notes.push(
      `${surplusCount} mortgage row${surplusCount > 1 ? "s" : ""} could not be matched to an owned ` +
        `security; counted as ordinary debt (no negative-gearing benefit, so capacity is understated).`,
    );
  }
  if (mortgages.length > 0 && owned.length > 0) {
    notes.push("Mortgages are paired to owned securities in row order.");
  }
  notes.push(
    `Existing mortgages assumed at ${ASSUMED_MORTGAGE_RATE}% over ${ASSUMED_MORTGAGE_TERM_YEARS} years — the fact find doesn't record rate or term.`,
  );

  // Deposit: cash plus anything already paid down on the purchase.
  const assets = data.financials.assets;
  const deposit = assets
    .filter((a) => a.kind === "Cash at bank" || a.kind === "Deposit paid on property")
    .reduce((t, a) => t + n(a.value), 0);
  if (deposit <= 0) missing.push("deposit");

  // Purchase state, from the security's postcode.
  const state = purchase ? stateFromPostcode(purchase.postcode) : null;
  if (!state) missing.push("purchase_state");

  // Household
  const servicing = data.financials.servicing;
  if (servicing.dependents == null) missing.push("dependents");
  if (servicing.monthly_living_expenses == null) missing.push("living_expenses");

  const termMonths = n(data.loan.term_months);
  const loanTerm = termMonths > 0 ? termMonths / 12 : ASSUMED_LOAN_TERM_YEARS;

  const inputs: CapacityInputs = {
    taxYear: CURRENT_TAX_YEAR,

    income,
    partner,
    otherIncome: 0,
    hasHecs: a1.has_hecs,
    partnerHasHecs: a2.has_hecs,
    hecsBalance: a1.hecs_balance,
    partnerHecsBalance: a2.hecs_balance,
    claimsStandardDeduction: true,

    dependents: n(servicing.dependents),
    // null → 0 → the engine floors it at HEM, which is the safe default.
    declaredExpenses: n(servicing.monthly_living_expenses),

    deposit,
    state: state ?? "QLD",
    isFhb: false,
    closingCosts: DEFAULT_CLOSING_COSTS,

    newWeeklyRent: purchase && isInvestment(purchase) ? n(purchase.rental_per_week) : 0,
    newPropertyIsNewBuild: false,

    properties,

    creditLimit,
    personalLoan: 0,
    carLoan,
    otherDebts: otherMonthly + surplusMonthly,
    consumerDebtBalance: consumerBalances + surplusBalance,

    rate: ASSUMED_NEW_LOAN_RATE,
    buffer: ASSUMED_BUFFER,
    loanTerm,
    rentShading: DEFAULT_RENT_SHADING,
    dtiCap: DEFAULT_DTI_CAP,
    negativeGearing: true,

    ...overrides,
  };

  return { inputs, missing, notes };
}

/** Prose for the UI. */
export const MISSING_FIELD_LABELS: Record<MissingField, string> = {
  applicant_income: "Applicant income — the capacity number is meaningless without it",
  living_expenses: "Declared living expenses — falling back to the HEM benchmark",
  dependents: "Number of dependents — assumed none, which lowers HEM",
  purchase_state: "Purchase postcode — stamp duty defaults to QLD",
  deposit: "Cash at bank / deposit paid — no purchase price can be derived",
};

/** True when the fact find is complete enough for the number to mean anything. */
export function capacityIsMeaningful(missing: MissingField[]): boolean {
  return !missing.includes("applicant_income");
}
