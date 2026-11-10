/**
 * The client scenario the matching engine assesses — the "fact find in" half of
 * "fact find in → ranked lender shortlist out".
 *
 * Composed rather than duplicated: the money side IS `CapacityInputs` from
 * `utils/finance/capacity.ts`, which already models income, tax, HECS, the
 * existing portfolio and consumer debt. This module adds only the dimensions
 * that are *policy* questions rather than arithmetic — who the applicants are,
 * what they're buying, and what's on their credit file.
 *
 * Pure types + an empty-scenario constructor. The fact-find bridge lives in
 * `utils/factfind-lender-scenario.ts` so that, exactly as with
 * `factfind-capacity.ts`, `utils/factfind.ts` and this module stay ignorant of
 * each other and only the bridge depends on both.
 */

import type { CapacityInputs } from "../finance/capacity";
import type { IncomeType, ResidencyStatus } from "./types";

// ─── Purpose ────────────────────────────────────────────────────────────────

export const LOAN_PURPOSES = [
  "purchase_owner_occupied",
  "purchase_investment",
  "refinance",
  "refinance_cash_out",
  "construction",
  "smsf",
] as const;
export type LoanPurpose = (typeof LOAN_PURPOSES)[number];

export const PURPOSE_LABELS: Record<LoanPurpose, string> = {
  purchase_owner_occupied: "Purchase — owner occupied",
  purchase_investment: "Purchase — investment",
  refinance: "Refinance (like for like)",
  refinance_cash_out: "Refinance with cash out",
  construction: "Construction",
  smsf: "SMSF",
};

// ─── Applicants ─────────────────────────────────────────────────────────────

export const EMPLOYMENT_BASES = [
  "permanent_full_time",
  "permanent_part_time",
  "probation",
  "casual",
  "fixed_term_contract",
  "contractor_abn",
  "self_employed",
  "retired",
  "not_employed",
] as const;
export type EmploymentBasis = (typeof EMPLOYMENT_BASES)[number];

export const EMPLOYMENT_BASIS_LABELS: Record<EmploymentBasis, string> = {
  permanent_full_time: "Permanent full time",
  permanent_part_time: "Permanent part time",
  probation: "On probation",
  casual: "Casual",
  fixed_term_contract: "Fixed-term contract",
  contractor_abn: "Contractor (own ABN)",
  self_employed: "Self employed",
  retired: "Retired",
  not_employed: "Not employed",
};

export type ScenarioApplicant = {
  label: string;
  residency: ResidencyStatus;
  /** Visa subclass, when residency is a temporary visa. e.g. "482". */
  visaSubclass?: string | null;
  employmentBasis: EmploymentBasis;
  /** Months in the current role. */
  monthsInCurrentRole: number | null;
  /** Months of continuous work in the same industry, across employers. */
  monthsInIndustry?: number | null;
  /** Months trading under the current ABN, for the self-employed. */
  monthsSelfEmployed?: number | null;
  /** Years of tax returns / financials available. */
  yearsFinancials?: number | null;
  /** Every income type this applicant relies on. Drives the income-policy
   *  check — a client leaning on overtime and a client on straight salary are
   *  different lender questions even at the same total income. */
  incomeTypes: IncomeType[];
  /** Occupation, matched against LMI-waiver profession lists. */
  occupation?: string | null;
  age?: number | null;
};

export function emptyApplicant(label = "Applicant 1"): ScenarioApplicant {
  return {
    label,
    residency: "australian_citizen",
    visaSubclass: null,
    employmentBasis: "permanent_full_time",
    monthsInCurrentRole: null,
    monthsInIndustry: null,
    monthsSelfEmployed: null,
    yearsFinancials: null,
    incomeTypes: ["payg_permanent_full_time"],
    occupation: null,
    age: null,
  };
}

// ─── Security ───────────────────────────────────────────────────────────────

export const PROPERTY_TYPES = [
  "house",
  "townhouse",
  "unit_apartment",
  "vacant_land",
  "rural_residential",
  "acreage",
  "company_title",
  "serviced_apartment",
  "student_accommodation",
  "display_home_leaseback",
  "nras",
  "sda_ndis",
  "other",
] as const;
export type ScenarioPropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<ScenarioPropertyType, string> = {
  house: "House",
  townhouse: "Townhouse",
  unit_apartment: "Unit / apartment",
  vacant_land: "Vacant land",
  rural_residential: "Rural residential",
  acreage: "Acreage",
  company_title: "Company title",
  serviced_apartment: "Serviced apartment",
  student_accommodation: "Student accommodation",
  display_home_leaseback: "Display home / leaseback",
  nras: "NRAS",
  sda_ndis: "SDA / NDIS housing",
  other: "Other",
};

export type ScenarioSecurity = {
  propertyType: ScenarioPropertyType;
  /** Internal floor area for a unit, m². The classic min-size knock-out. */
  floorAreaSqm?: number | null;
  landSizeHa?: number | null;
  postcode?: string | null;
  /** More than ~6 storeys / a large complex — triggers high-density policy. */
  highDensity?: boolean;
  offThePlan?: boolean;
  leasehold?: boolean;
};

// ─── Credit history ─────────────────────────────────────────────────────────

export type ScenarioCredit = {
  defaultsCount: number;
  defaultsTotalAmount: number;
  /** Are the listed defaults paid out? */
  defaultsPaid: boolean;
  /** Age of the most recent default, months. */
  defaultsAgeMonths?: number | null;
  judgments: boolean;
  /** Years since discharge. Null = never bankrupt. */
  bankruptcyDischargedYears?: number | null;
  partIxDischargedYears?: number | null;
  arrears6Months: number;
  arrears12Months: number;
  creditScore?: number | null;
  enquiries6Months?: number | null;
};

export function emptyCredit(): ScenarioCredit {
  return {
    defaultsCount: 0,
    defaultsTotalAmount: 0,
    defaultsPaid: true,
    defaultsAgeMonths: null,
    judgments: false,
    bankruptcyDischargedYears: null,
    partIxDischargedYears: null,
    arrears6Months: 0,
    arrears12Months: 0,
    creditScore: null,
    enquiries6Months: null,
  };
}

// ─── The scenario ───────────────────────────────────────────────────────────

export type LenderScenario = {
  /** Everything the servicing calculator needs. Reused verbatim, then overlaid
   *  with each lender's own buffer / shading / DTI cap during matching. */
  capacity: CapacityInputs;

  purpose: LoanPurpose;
  /** The loan being sought. Null = "tell me the maximum". */
  loanAmount: number | null;
  /** Purchase price or current valuation. Null = solved from capacity. */
  propertyValue: number | null;

  applicants: ScenarioApplicant[];
  security: ScenarioSecurity;
  credit: ScenarioCredit;

  /** Cash the client can evidence as genuine savings. */
  genuineSavings: number;
  genuineSavingsMonthsHeld: number;
  /** Any part of the deposit that is a gift. */
  giftedDeposit: boolean;
  guarantorAvailable: boolean;
  /** Requested term, years. Interacts with age-at-maturity policy. */
  loanTermYears: number;
  interestOnly: boolean;
  interestOnlyYears?: number | null;
};

/** True when there is enough here for a lender shortlist to mean anything. */
export function scenarioIsMeaningful(s: LenderScenario): boolean {
  const income = (s.capacity?.income ?? 0) + (s.capacity?.partner ?? 0);
  return income > 0 && s.applicants.length > 0;
}

/**
 * What is missing that would materially change the shortlist. Surfaced in the
 * UI so a broker can see WHY a lender came back `unknown` rather than assuming
 * the tool has nothing to say.
 */
export function scenarioGaps(s: LenderScenario): string[] {
  const gaps: string[] = [];
  if (!s.propertyValue && !s.loanAmount) {
    gaps.push("No purchase price or loan amount — LVR and loan-size rules can't be checked.");
  }
  if (s.security.propertyType === "unit_apartment" && !s.security.floorAreaSqm) {
    gaps.push("Unit floor area not recorded — minimum-size policy can't be checked.");
  }
  if (!s.security.postcode) {
    gaps.push("No postcode — restricted-postcode and rural policy can't be checked.");
  }
  for (const a of s.applicants) {
    if (a.monthsInCurrentRole === null || a.monthsInCurrentRole === undefined) {
      gaps.push(`${a.label}: months in current role not recorded — tenure rules can't be checked.`);
    }
    if (a.employmentBasis === "self_employed" && !a.yearsFinancials) {
      gaps.push(`${a.label}: years of financials not recorded — self-employed policy can't be checked.`);
    }
  }
  return gaps;
}
