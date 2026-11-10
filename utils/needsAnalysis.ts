/**
 * Shared schema, types and pure helpers for the NCCP Client Needs Analysis
 * (nccp_needs_analyses).
 *
 * Mirrors the six-page paper "Client Needs Analysis" used on the Your Loan
 * Assist / credit-assistance side of the business: interview → needs &
 * objectives → loan basics → two applicants (identity, address history,
 * contact, employment) → a relative → other income → assets → liabilities →
 * living expenses.
 *
 * Everything the form captures lives in the `data` jsonb blob; the table's
 * top-level columns (applicant_name, loan_amount, status…) are denormalised
 * copies kept only so the list view can render without parsing every blob.
 *
 * This form overlaps heavily with the Borrower Fact Find (utils/factfind.ts) —
 * both capture applicant identity, assets, liabilities and a financial
 * position. It is deliberately a separate document (the NCCP needs-analysis is
 * a distinct compliance artefact under the National Consumer Credit Protection
 * Act), but a future pre-fill bridge from a Fact Find would save re-keying.
 */

import { errMessage } from "./errors";

/* ── Enumerations ────────────────────────────────────────────────────────── */

export const NEEDS_ANALYSIS_STATUSES = ["Draft", "In review", "Complete"] as const;
export type NeedsAnalysisStatus = (typeof NEEDS_ANALYSIS_STATUSES)[number];

/**
 * The terminal status. Reaching it means the document is signed/complete and
 * becomes read-only (see utils/compliance-audit.ts). Kept here so both the
 * client form and the server lock logic derive "locked" from one constant.
 */
export const NEEDS_ANALYSIS_TERMINAL_STATUS: NeedsAnalysisStatus = "Complete";

/** Interview channel (page 1 header). */
export const INTERVIEW_TYPES = [
  { key: "face_to_face", label: "Face to face" },
  { key: "phone", label: "Phone" },
  { key: "voice_call", label: "Voice call" },
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number]["key"];

export const MARITAL_STATUSES = ["single", "married", "de_facto"] as const;
export const TENURE_OPTIONS = ["owns", "rents", "other"] as const;
export const PREFERRED_CONTACT_OPTIONS = ["mobile", "home", "work", "email"] as const;
export const EMPLOYMENT_TYPES = ["payg", "self_employed", "unemployed", "retired"] as const;
export const EMPLOYMENT_BASES = ["casual", "part_time", "full_time", "contractor"] as const;
export const INCOME_GROSS_NET = ["gross", "net"] as const;
export const PAY_FREQUENCIES = ["wk", "fn", "m", "pa"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

/** Who an asset / liability / income belongs to. */
export const OWNER_OPTIONS = ["app1", "app2", "both"] as const;

/**
 * The kinds of income that are not a salary from the applicant's main job.
 *
 * The paper form asks for these as one free-text line — "Bonus, Commission,
 * Centrelink, Family Assistance" — for the whole household. That is not good
 * enough for two reasons, and both have bitten:
 *
 *   1. IT IS NOT ATTRIBUTED. A household line cannot say WHOSE income it is,
 *      so a lender assessing one applicant's servicing cannot use it, and the
 *      income reconciliation had to guess by scanning the prose for a first
 *      name (see loadDeclaredIncome). Guessing whose money it is, on a document
 *      the client signs, is not a thing to keep doing.
 *
 *   2. IT IS NOT A NUMBER. "David casual Woolworths 1 day per $400 per week" is
 *      a sentence, not an amount at a frequency, so nothing downstream can add
 *      it up or compare it to a payslip. The unevidenced-income finding exists
 *      precisely because that claim could not be checked.
 *
 * So other income is now rows: a type, an amount, a frequency, and whose it is.
 */
export const OTHER_INCOME_TYPES = [
  "Bonus",
  "Commission",
  "Overtime",
  "Second job",
  "Rental income",
  "Centrelink / Family Assistance",
  "Child support",
  "Investment / dividends",
  "Superannuation / pension",
  "Other",
] as const;
export type OtherIncomeType = (typeof OTHER_INCOME_TYPES)[number];

/** Asset rows the paper form pre-prints, in order. */
export const ASSET_TYPES = [
  "Principal Home",
  "Investment Property",
  "Motor Vehicle",
  "Savings Account",
  "Home Contents",
  "Superannuation",
  "Other",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** Liability rows the paper form pre-prints, in order. */
export const LIABILITY_TYPES = [
  "Home Loan",
  "Personal Loan",
  "Car Loan",
  "Credit Card",
  "After Pay/Zip Pay",
  "Other",
] as const;
export type LiabilityType = (typeof LIABILITY_TYPES)[number];

/**
 * The fixed living-expense categories, in the exact order the paper prints
 * them. The paper deliberately repeats "Other" three times at the end.
 */
export const LIVING_EXPENSE_LABELS = [
  "Utilities",
  "Rates",
  "Body Corporate",
  "Ongoing Rent",
  "Transport",
  "Car expenses",
  "Food / Groceries",
  "Communication & Media",
  "Medical & Health",
  "Education & Childcare",
  "Child Support/Maintenance",
  "Insurance - General",
  "Insurance - Health",
  "Insurance - Risk",
  "Entertainment & Recreation",
  "Clothing & Personal Care",
  "Gift/Donations",
  "Other",
  "Other",
  "Other",
] as const;

/* ── Row / sub-object types ──────────────────────────────────────────────── */

export type CurrentAddress = {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  date_moved_in: string;
  /** owns | rents | other */
  tenure: string;
};

export type PreviousAddress = {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  date_moved_in: string;
  date_moved_out: string;
};

export type MailingAddress = {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
};

export type ContactDetails = {
  mobile_phone: string;
  home_phone: string;
  work_phone: string;
  email: string;
  /** mobile | home | work | email */
  preferred_contact: string;
};

export type AdditionalDetails = {
  mothers_maiden_name: string;
  /** Driver's licence or passport number. */
  id_document: string;
  foreign_tax_status_tfn: string;
  town_country_of_birth: string;
  estimated_retirement_age: string;
};

export type EmployerDetails = {
  street: string;
  suburb: string;
  state: string;
  postcode: string;
  contact_name: string;
  contact_phone: string;
};

export type CurrentEmployment = {
  /** payg | self_employed | unemployed | retired */
  employment_type: string;
  /** casual | part_time | full_time | contractor */
  employment_basis: string;
  date_started: string;
  occupation: string;
  income_amount: number | null;
  /** gross | net */
  income_gross_or_net: string;
  /** wk | fn | m | pa */
  pay_frequency: string;
  employer: EmployerDetails;
  on_probation: boolean;
  probation_time_left: string;
};

export type PreviousEmployment = CurrentEmployment & {
  date_finished: string;
};

export type Applicant = {
  title: string;
  surname: string;
  given_names: string;
  preferred_name: string;
  previous_name: string;
  dob: string;
  gender: string;
  /** single | married | de_facto */
  marital_status: string;
  dependents_count: number | null;
  dependents_dob: string;
  current_address: CurrentAddress;
  previous_address: PreviousAddress;
  mailing_address: MailingAddress;
  contact: ContactDetails;
  additional: AdditionalDetails;
  current_employment: CurrentEmployment;
  previous_employment: PreviousEmployment;
};

export type Relative = {
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type Asset = {
  id: string;
  /** One of ASSET_TYPES. */
  type: string;
  description: string;
  estimated_value: number | null;
  /** app1 | app2 | both */
  owner: string;
  /** Only meaningful for an Investment Property. */
  rental_income: number | null;
};

export type Liability = {
  id: string;
  /** One of LIABILITY_TYPES. */
  type: string;
  loan_provider: string;
  loan_balance: number | null;
  loan_limit: number | null;
  repayments: number | null;
  loan_term: string;
  loan_start_end_date: string;
  fixed_io_expiry: string;
  /** app1 | app2 | both */
  owner: string;
};

export type OtherIncome = {
  id: string;
  /** One of OTHER_INCOME_TYPES. */
  type: string;
  /** Who pays it, or what it is — "Woolworths, 1 day/wk", "Family Tax Benefit A". */
  description: string;
  amount: number | null;
  /** wk | fn | m | pa */
  frequency: string;
  /** app1 | app2 | both — WHOSE income this is. */
  owner: string;
};

export type LivingExpense = {
  amount: number | null;
  /** wk | fn | m | pa */
  frequency: string;
  /** "If $0.00 against any Type, enter an explanation." */
  description: string;
};

export type NeedsAnalysisData = {
  /** face_to_face | phone | voice_call */
  interview_type: string;
  location: string;
  date_time: string;
  /** "Why do you need a loan?" */
  needs_objectives: string;
  loan_amount_sought: number | null;
  /** Have you purchased / signed a contract of sale? */
  purchased_or_signed_cos: boolean | null;
  first_home_buyer: boolean | null;
  applicants: [Applicant, Applicant];
  relative: Relative;
  /**
   * Other income, per applicant, as rows. See OTHER_INCOME_TYPES.
   */
  other_incomes: OtherIncome[];
  /**
   * LEGACY. The single household free-text line this form used to carry.
   *
   * Retained and still rendered where non-empty, because Needs Analyses signed
   * before other_incomes existed hold their only record of a client's extra
   * income here — dropping the field would silently delete it from documents
   * that have already been relied on. Nothing writes it now, and it is NOT
   * auto-parsed into rows: splitting a sentence into an amount and an owner is
   * exactly the guessing this change exists to stop.
   */
  other_income: string;
  assets: Asset[];
  liabilities: Liability[];
  liabilities_notes: string;
  living_expenses: LivingExpense[];
};

/** A persisted needs analysis (table row). */
export type NeedsAnalysis = {
  id: string;
  applicant_name: string | null;
  status: string;
  contact_id: string | null;
  deal_id: string | null;
  loan_amount: number | null;
  data: NeedsAnalysisData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/* ── Empty template ──────────────────────────────────────────────────────── */

/**
 * Stable row ids without Math.random/Date.now, so a fresh template is
 * deterministic (server and client render the same thing — no hydration drift).
 */
function rowId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

function emptyCurrentAddress(): CurrentAddress {
  return { street: "", suburb: "", state: "", postcode: "", date_moved_in: "", tenure: "" };
}

function emptyPreviousAddress(): PreviousAddress {
  return { street: "", suburb: "", state: "", postcode: "", date_moved_in: "", date_moved_out: "" };
}

function emptyMailingAddress(): MailingAddress {
  return { street: "", suburb: "", state: "", postcode: "" };
}

function emptyContact(): ContactDetails {
  return { mobile_phone: "", home_phone: "", work_phone: "", email: "", preferred_contact: "" };
}

function emptyAdditional(): AdditionalDetails {
  return {
    mothers_maiden_name: "",
    id_document: "",
    foreign_tax_status_tfn: "",
    town_country_of_birth: "",
    estimated_retirement_age: "",
  };
}

function emptyEmployer(): EmployerDetails {
  return { street: "", suburb: "", state: "", postcode: "", contact_name: "", contact_phone: "" };
}

function emptyCurrentEmployment(): CurrentEmployment {
  return {
    employment_type: "",
    employment_basis: "",
    date_started: "",
    occupation: "",
    income_amount: null,
    income_gross_or_net: "",
    pay_frequency: "",
    employer: emptyEmployer(),
    on_probation: false,
    probation_time_left: "",
  };
}

function emptyPreviousEmployment(): PreviousEmployment {
  return { ...emptyCurrentEmployment(), date_finished: "" };
}

function emptyApplicant(): Applicant {
  return {
    title: "",
    surname: "",
    given_names: "",
    preferred_name: "",
    previous_name: "",
    dob: "",
    gender: "",
    marital_status: "",
    dependents_count: null,
    dependents_dob: "",
    current_address: emptyCurrentAddress(),
    previous_address: emptyPreviousAddress(),
    mailing_address: emptyMailingAddress(),
    contact: emptyContact(),
    additional: emptyAdditional(),
    current_employment: emptyCurrentEmployment(),
    previous_employment: emptyPreviousEmployment(),
  };
}

export function emptyAsset(type: string, n: number): Asset {
  return { id: rowId("asset", n), type, description: "", estimated_value: null, owner: "", rental_income: null };
}

export function emptyOtherIncome(type: string, n: number): OtherIncome {
  return { id: rowId("otherinc", n), type, description: "", amount: null, frequency: "m", owner: "" };
}

export function emptyLiability(type: string, n: number): Liability {
  return {
    id: rowId("liab", n),
    type,
    loan_provider: "",
    loan_balance: null,
    loan_limit: null,
    repayments: null,
    loan_term: "",
    loan_start_end_date: "",
    fixed_io_expiry: "",
    owner: "",
  };
}

/** Seeds the asset rows the paper form pre-prints. */
function defaultAssets(): Asset[] {
  const types: string[] = [
    "Principal Home",
    "Investment Property",
    "Motor Vehicle",
    "Savings Account",
    "Home Contents",
    "Superannuation",
  ];
  return types.map((t, i) => emptyAsset(t, i));
}

/** Seeds the liability rows the paper form pre-prints. */
function defaultLiabilities(): Liability[] {
  const types: string[] = ["Home Loan", "Credit Card"];
  return types.map((t, i) => emptyLiability(t, i));
}

/** The fixed living-expense rows, one per LIVING_EXPENSE_LABELS entry. */
function defaultLivingExpenses(): LivingExpense[] {
  return LIVING_EXPENSE_LABELS.map(() => ({ amount: null, frequency: "m", description: "" }));
}

export function emptyNeedsAnalysis(): NeedsAnalysisData {
  return {
    interview_type: "",
    location: "",
    date_time: "",
    needs_objectives: "",
    loan_amount_sought: null,
    purchased_or_signed_cos: null,
    first_home_buyer: null,
    applicants: [emptyApplicant(), emptyApplicant()],
    relative: { name: "", phone: "", email: "", address: "" },
    // No rows pre-printed: most households have no other income, and a grid of
    // blank rows reads as something that must be filled in.
    other_incomes: [],
    other_income: "",
    assets: defaultAssets(),
    liabilities: defaultLiabilities(),
    liabilities_notes: "",
    living_expenses: defaultLivingExpenses(),
  };
}

/**
 * Merge a persisted blob over the current template. Older rows that predate a
 * field still open cleanly, and a blob missing whole sections can't crash the
 * form. User-ordered arrays (assets, liabilities) are taken wholesale; the
 * fixed living-expense rows are overlaid by index so the template's labels and
 * count always win.
 */
export function hydrateNeedsAnalysis(raw: unknown): NeedsAnalysisData {
  const base = emptyNeedsAnalysis();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<NeedsAnalysisData>;

  const mergeApplicant = (a: Partial<Applicant> | undefined): Applicant => {
    const b = emptyApplicant();
    if (!a || typeof a !== "object") return b;
    return {
      ...b,
      ...a,
      current_address: { ...b.current_address, ...(a.current_address ?? {}) },
      previous_address: { ...b.previous_address, ...(a.previous_address ?? {}) },
      mailing_address: { ...b.mailing_address, ...(a.mailing_address ?? {}) },
      contact: { ...b.contact, ...(a.contact ?? {}) },
      additional: { ...b.additional, ...(a.additional ?? {}) },
      current_employment: {
        ...b.current_employment,
        ...(a.current_employment ?? {}),
        employer: { ...b.current_employment.employer, ...(a.current_employment?.employer ?? {}) },
      },
      previous_employment: {
        ...b.previous_employment,
        ...(a.previous_employment ?? {}),
        employer: { ...b.previous_employment.employer, ...(a.previous_employment?.employer ?? {}) },
      },
    };
  };

  const applicants: [Applicant, Applicant] =
    Array.isArray(d.applicants) && d.applicants.length === 2
      ? [mergeApplicant(d.applicants[0]), mergeApplicant(d.applicants[1])]
      : base.applicants;

  // Fixed rows: overlay stored amounts/frequencies by index, never grow/shrink.
  const living_expenses = base.living_expenses.map((row, i) => {
    const got = Array.isArray(d.living_expenses) ? d.living_expenses[i] : undefined;
    if (!got || typeof got !== "object") return row;
    return {
      amount: typeof got.amount === "number" && isFinite(got.amount) ? got.amount : null,
      frequency: typeof got.frequency === "string" && got.frequency ? got.frequency : row.frequency,
      description: typeof got.description === "string" ? got.description : "",
    };
  });

  return {
    interview_type: d.interview_type ?? base.interview_type,
    location: d.location ?? base.location,
    date_time: d.date_time ?? base.date_time,
    needs_objectives: d.needs_objectives ?? base.needs_objectives,
    loan_amount_sought: typeof d.loan_amount_sought === "number" ? d.loan_amount_sought : base.loan_amount_sought,
    purchased_or_signed_cos:
      typeof d.purchased_or_signed_cos === "boolean" ? d.purchased_or_signed_cos : base.purchased_or_signed_cos,
    first_home_buyer: typeof d.first_home_buyer === "boolean" ? d.first_home_buyer : base.first_home_buyer,
    applicants,
    relative: { ...base.relative, ...(d.relative ?? {}) },
    /* Rows are taken wholesale (they're user-ordered) and NOT derived from the
     * legacy `other_income` line. Parsing "David casual Woolworths 1 day per
     * $400 per week" into an amount and an owner is precisely the guessing this
     * change removed; a document signed under the old shape keeps its sentence,
     * and a human decides what the rows should say. */
    other_incomes: Array.isArray(d.other_incomes)
      ? d.other_incomes.map((o) => ({ ...emptyOtherIncome("Other", 0), ...o }))
      : base.other_incomes,
    other_income: d.other_income ?? base.other_income,
    assets: Array.isArray(d.assets) && d.assets.length ? d.assets.map((a) => ({ ...emptyAsset("Other", 0), ...a })) : base.assets,
    liabilities:
      Array.isArray(d.liabilities) && d.liabilities.length
        ? d.liabilities.map((l) => ({ ...emptyLiability("Other", 0), ...l }))
        : base.liabilities,
    liabilities_notes: d.liabilities_notes ?? base.liabilities_notes,
    living_expenses,
  };
}

/* ── Derived figures ─────────────────────────────────────────────────────── */

export type NeedsAnalysisTotals = {
  totalAssets: number;
  totalLiabilities: number;
  /** Sum of every living-expense line converted to a monthly figure. */
  monthlyLivingExpenses: number;
  /** Sum of every other-income row converted to a monthly figure. */
  monthlyOtherIncome: number;
};

const sum = (xs: (number | null | undefined)[]) =>
  xs.reduce<number>((t, v) => t + (typeof v === "number" && isFinite(v) ? v : 0), 0);

/** Convert an amount at a pay/expense frequency to a per-month figure. */
export function toMonthly(amount: number | null | undefined, frequency: string): number {
  if (typeof amount !== "number" || !isFinite(amount)) return 0;
  switch (frequency) {
    case "wk":
      return (amount * 52) / 12;
    case "fn":
      return (amount * 26) / 12;
    case "pa":
      return amount / 12;
    case "m":
    default:
      return amount;
  }
}

export function computeNeedsAnalysisTotals(data: NeedsAnalysisData): NeedsAnalysisTotals {
  return {
    totalAssets: sum(data.assets.map((a) => a.estimated_value)),
    totalLiabilities: sum(data.liabilities.map((l) => l.loan_balance)),
    monthlyLivingExpenses: data.living_expenses.reduce((t, e) => t + toMonthly(e.amount, e.frequency), 0),
    monthlyOtherIncome: (data.other_incomes ?? []).reduce(
      (t, o) => t + toMonthly(o.amount, o.frequency),
      0,
    ),
  };
}

/**
 * Other income belonging to one applicant, as a per-month figure.
 *
 * `both` counts for either applicant, because a jointly-received payment is
 * income to the household the applicant is in — the caller decides whether to
 * halve it. Nothing here guesses an owner: a row with no owner set belongs to
 * nobody and is excluded, which is visible and correctable rather than silently
 * attributed to applicant 1.
 */
export function monthlyOtherIncomeFor(data: NeedsAnalysisData, applicant: "app1" | "app2"): number {
  return (data.other_incomes ?? [])
    .filter((o) => o.owner === applicant || o.owner === "both")
    .reduce((t, o) => t + toMonthly(o.amount, o.frequency), 0);
}

/** "$400,000" — whole dollars, the convention on the paper form. "" when unset. */
export function formatMoney(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

/** "Smith, John & Smith, Jane" — the list-view label. Empty applicants drop out. */
export function applicantSummary(data: NeedsAnalysisData): string {
  return data.applicants
    .map((a) => [a.surname.trim(), a.given_names.trim()].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" & ");
}

/**
 * Sections still missing something before this can be called Complete.
 * Advisory only — nothing here blocks a save, since a needs analysis is filled
 * in over the course of an interview.
 */
export function outstandingSections(data: NeedsAnalysisData): string[] {
  const missing: string[] = [];
  const a = data.applicants[0];
  if (!data.interview_type) missing.push("Interview type");
  if (!a.surname.trim() || !a.given_names.trim()) missing.push("Applicant 1 name");
  if (!a.dob) missing.push("Applicant 1 date of birth");
  if (!a.current_address.street.trim()) missing.push("Applicant 1 current address");
  if (!data.needs_objectives.trim()) missing.push("Needs & objectives");
  if (data.loan_amount_sought == null) missing.push("Loan amount sought");
  return missing;
}

/* ── Supabase plumbing ───────────────────────────────────────────────────── */

/**
 * Human message from a Supabase PostgrestError, falling back to `errMessage`.
 * A PostgrestError is a plain object, not an `Error`, so `errMessage` alone
 * returns the fallback and discards what the database actually said.
 */
export function needsAnalysisErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return errMessage(e, fallback);
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || errMessage(e, fallback);
}

/**
 * True when the failure is just "table not created yet" (migration not run).
 *
 * Deliberately narrow. A missing *column* reports as PGRST204 or 42703 — both
 * of which a loose "schema cache" / "does not exist" substring test would
 * swallow, telling the operator to run a migration they have already run. Match
 * the table-level codes, and only fall back to a substring test that names a
 * *table*.
 */
export function needsAnalysesTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  // Column-level failures are a schema mismatch, not an unmigrated table.
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
