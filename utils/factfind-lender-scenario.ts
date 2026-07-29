/**
 * Fact find → lender scenario bridge.
 *
 * The lender-matching analogue of `utils/factfind-capacity.ts`, and a separate
 * module for the same reason: `utils/factfind.ts` and `utils/lender-policy/`
 * don't know about each other, and only the bridge depends on both.
 *
 * It composes rather than duplicates — the money half of a `LenderScenario`
 * IS the `CapacityInputs` that `factFindToCapacityInputs()` already produces,
 * so there is exactly one mapping from a fact find to a servicing model.
 *
 * ── WHAT THE FACT FIND CANNOT TELL US ────────────────────────────────────
 * The paper Borrower Fact Finder was designed to feed a credit submission where
 * a human read the payslips. It does not record employment basis, months in the
 * role, residency status, or anything about the credit file — and those are
 * precisely the fields that decide which lenders will look at a client.
 *
 * So this bridge does NOT invent them. It defaults to the most common case
 * (permanent full-time, Australian citizen, clean credit file) and returns
 * `assumptions` naming every default it applied. The UI shows that list as a
 * prompt to confirm before trusting the shortlist. Defaulting silently would
 * produce a confident shortlist built on a fiction — the exact failure the
 * verification layer exists to prevent, reintroduced on the input side.
 */

import { factFindToCapacityInputs, type MissingField } from "./factfind-capacity";
import type { FactFindData } from "./factfind";
import type { CapacityInputs } from "./finance/capacity";
import {
  emptyApplicant,
  emptyCredit,
  type LenderScenario,
  type LoanPurpose,
  type ScenarioApplicant,
  type ScenarioPropertyType,
} from "./lender-policy/scenario";

export type ScenarioBridgeResult = {
  scenario: LenderScenario;
  /** Fact-find fields missing for the SERVICING half (from the capacity bridge). */
  missing: MissingField[];
  /** Lossy mappings that happened, inherited from the capacity bridge. */
  notes: string[];
  /**
   * Policy inputs the fact find has no field for, and the value assumed.
   * Every one of these must be confirmed by the broker before the shortlist
   * means anything — they are knock-out fields.
   */
  assumptions: string[];
};

const n = (v: number | null | undefined): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** Map the fact find's free-text security `use` onto a scenario property type. */
export function propertyTypeFromUse(use: string): ScenarioPropertyType {
  const u = (use ?? "").toLowerCase();
  if (/unit|apartment|flat|strata/.test(u)) return "unit_apartment";
  if (/townhouse|villa|duplex/.test(u)) return "townhouse";
  if (/vacant|land only|land$/.test(u)) return "vacant_land";
  if (/acreage|farm|rural/.test(u)) return "rural_residential";
  if (/house|dwelling|residential/.test(u)) return "house";
  return "house";
}

/** Investment vs owner-occupied, from the security's stated use/ownership. */
function purposeFromFactFind(data: FactFindData): LoanPurpose {
  const purchase = data.securities.find((s) => /purchas/i.test(s.ownership ?? ""));
  if (!purchase) return "purchase_owner_occupied";
  const rents = n(purchase.rental_per_week) > 0;
  const invest = /invest|rent/i.test(`${purchase.use ?? ""} ${purchase.ownership ?? ""}`);
  return rents || invest ? "purchase_investment" : "purchase_owner_occupied";
}

export function factFindToLenderScenario(
  data: FactFindData,
  overrides: Partial<CapacityInputs> = {},
): ScenarioBridgeResult {
  const { inputs, missing, notes } = factFindToCapacityInputs(data, overrides);
  const assumptions: string[] = [];

  // ── Applicants ────────────────────────────────────────────────────────
  const applicants: ScenarioApplicant[] = [];
  data.applicants.forEach((a, index) => {
    const named = `${a.given_names ?? ""} ${a.family_name ?? ""}`.trim();
    const hasSomething = named !== "" || n(a.annual_income) > 0;
    if (!hasSomething) return;
    const applicant = emptyApplicant(named || `Applicant ${index + 1}`);
    applicant.occupation = a.occupation || null;
    // DOB is on the form; age isn't, and age-at-maturity is a real policy check.
    if (a.date_of_birth) {
      const born = Date.parse(a.date_of_birth);
      if (!Number.isNaN(born)) {
        applicant.age = Math.floor((Date.now() - born) / (365.25 * 24 * 3600 * 1000));
      }
    }
    applicants.push(applicant);
  });
  if (applicants.length === 0) applicants.push(emptyApplicant());

  assumptions.push(
    "Employment basis assumed permanent full-time for every applicant — the fact find does not record it, and casual/probation/contract status is a knock-out for many lenders.",
  );
  assumptions.push(
    "Months in the current role are not recorded, so employment-tenure rules could not be checked.",
  );
  assumptions.push(
    "Residency assumed Australian citizen — the fact find does not record residency or visa status.",
  );
  assumptions.push(
    "Income assumed to be straight salary. Overtime, bonus, commission, casual and Centrelink income are shaded differently by every lender and are not itemised on this form.",
  );
  assumptions.push(
    "Credit file assumed clean (no defaults, judgments, bankruptcy or arrears) — the fact find has no credit-history section.",
  );

  // ── Security ──────────────────────────────────────────────────────────
  const purchase = data.securities.find((s) => /purchas/i.test(s.ownership ?? ""));
  const propertyValue = purchase ? n(purchase.estimated_value) || null : null;
  const security: LenderScenario["security"] = {
    propertyType: propertyTypeFromUse(purchase?.use ?? ""),
    floorAreaSqm: null,
    landSizeHa: null,
    postcode: purchase?.postcode || null,
    highDensity: false,
    offThePlan: false,
    leasehold: false,
  };
  if (security.propertyType === "unit_apartment") {
    assumptions.push(
      "Unit internal floor area is not recorded on the fact find, so minimum-size policy could not be checked.",
    );
  }
  if (!purchase) {
    assumptions.push(
      'No security is marked "Being purchased", so property type, value and postcode were left blank and the LVR rules could not be checked.',
    );
  }

  // ── Deposit / savings ─────────────────────────────────────────────────
  // The form records assets, not which of them are *genuine savings* held for
  // the required period. Treating the deposit as genuine savings would be the
  // optimistic error, so it is treated as unevidenced instead.
  assumptions.push(
    "Genuine savings recorded as $0 — the fact find captures total assets, not savings held in the client's own name for the required period. Enter the evidenced figure to check genuine-savings policy.",
  );

  const scenario: LenderScenario = {
    capacity: inputs,
    purpose: purposeFromFactFind(data),
    loanAmount: null,
    propertyValue,
    applicants,
    security,
    credit: emptyCredit(),
    genuineSavings: 0,
    genuineSavingsMonthsHeld: 0,
    giftedDeposit: false,
    guarantorAvailable: false,
    loanTermYears: inputs.loanTerm,
    interestOnly: false,
    interestOnlyYears: null,
  };

  return { scenario, missing, notes, assumptions };
}
