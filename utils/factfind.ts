/**
 * Shared schema, types and pure helpers for the Borrower Fact Find (fact_finds).
 *
 * Mirrors the seven-page "Generic Borrower Fact Finder Form" used by the broker
 * side of the business: applicants → entities → advisors → loan → security →
 * financial position → disclosures → declarations.
 *
 * Everything the form captures lives in the `data` jsonb blob; the table's
 * top-level columns (applicant_name, status, loan_amount…) are denormalised
 * copies kept only so the list view can render without parsing every blob.
 *
 * The declaration and privacy wording is reproduced from the source form
 * (Consumer Credit Code s.11 reg.10 / Privacy Act 1988 s.18E, s.18L). Treat it
 * as legal copy — do not paraphrase it without sign-off from the Licensor.
 */

import { errMessage } from "./errors";

/* ── Enumerations ────────────────────────────────────────────────────────── */

export const FACT_FIND_STATUSES = ["Draft", "In review", "Complete"] as const;
export type FactFindStatus = (typeof FACT_FIND_STATUSES)[number];

export const APPLICANT_CAPACITIES = ["Borrower", "Guarantor", "Joint applicant"] as const;
export const ENTITY_TYPES = ["Partnership", "Company", "Trust"] as const;
export const PROPERTY_USES = ["Owner occupied", "Investment property"] as const;
export const OWNERSHIP_STATUSES = ["Being purchased", "Already owned"] as const;

/** Liability rows the source form pre-prints, in order. */
export const LIABILITY_KINDS = [
  "Mortgage",
  "Car lease",
  "Overdraft",
  "Other loan",
  "Credit card",
] as const;
export type LiabilityKind = (typeof LIABILITY_KINDS)[number];

/** Asset rows the source form pre-prints, in order. */
export const ASSET_KINDS = [
  "Property",
  "Cash at bank",
  "Deposit paid on property",
  "Motor vehicle",
  "Personal effects",
  "Superannuation",
  "Business value",
  "Shares and investments",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** The five yes/no disclosures on pages 3–4, verbatim. */
export const DISCLOSURE_QUESTIONS = [
  {
    key: "bankruptcy",
    text: "Have you or your spouse ever been declared bankrupt or insolvent, or has either estate been assigned for the benefit of creditors?",
  },
  {
    key: "receivership",
    text: "Have you or your spouse ever been shareholders or officers of any company of which a manager, receiver or liquidator has been appointed?",
  },
  {
    key: "judgement",
    text: "Is there any unsatisfied judgement entered in any court against you, your spouse, or any company of which either of you or your spouse are or were a shareholder or officer?",
  },
  {
    key: "craa_default",
    text: "Have you or your spouse ever been registered with the CRAA as in default?",
  },
  {
    key: "directorships",
    text: "Are you the director or shareholder of any companies?",
  },
] as const;

export type DisclosureKey = (typeof DISCLOSURE_QUESTIONS)[number]["key"];

/** Declaration-of-purpose bases (Consumer Credit Code s.11, reg.10). */
export const PURPOSE_BASES = [
  { key: "business", text: "business purposes" },
  { key: "investment", text: "investment purposes other than investment in residential property" },
] as const;
export type PurposeBasis = (typeof PURPOSE_BASES)[number]["key"];

/* ── Row types ───────────────────────────────────────────────────────────── */

export type Applicant = {
  title: string;
  family_name: string;
  given_names: string;
  capacity: string;
  address: string;
  postcode: string;
  phone_work: string;
  phone_home: string;
  email: string;
  date_of_birth: string;
  drivers_licence: string;
  occupation: string;
};

export type Entity = {
  name: string;
  acn: string;
  entity_type: string;
  capacity: string;
  postal_address: string;
  postal_postcode: string;
  trading_address: string;
  trading_postcode: string;
  phone: string;
  fax: string;
  incorporation_date: string;
  principal_activity: string;
};

export type Advisor = {
  firm: string;
  address: string;
  postcode: string;
  telephone: string;
  fax: string;
  contact_name: string;
  /** Solicitors only — the source form asks for a DX exchange box. */
  dx_number?: string;
  dx_location?: string;
};

export type LoanRequest = {
  /** Net of fees and charges, as the source form specifies. */
  amount_required: number | null;
  term_months: number | null;
  expected_settlement: string;
  purpose: string;
  repayment_strategy: string;
};

export type SecurityProperty = {
  address: string;
  suburb: string;
  postcode: string;
  folio_identifier: string;
  zoning: string;
  use: string;
  ownership: string;
  estimated_value: number | null;
  quick_valuation: boolean;
  rental_per_week: number | null;
  valuer_contact_name: string;
  phone_business: string;
  phone_after_hours: string;
  phone_mobile: string;
};

export type Liability = {
  id: string;
  kind: LiabilityKind;
  /** Lender / lessor / description. For a credit card this names the issuer. */
  label: string;
  /** Balance outstanding. For a credit card this is the *limit*, per the form. */
  balance: number | null;
  monthly: number | null;
};

export type Asset = {
  id: string;
  kind: AssetKind;
  label: string;
  value: number | null;
};

export type Disclosure = {
  answer: "yes" | "no" | null;
  details: string;
};

/** A typed name + date. The wet/e-signature happens on the exported PDF. */
export type Signatory = { name: string; date: string };

export type FactFindData = {
  referred_by: string;
  applicants: [Applicant, Applicant];
  entity: Entity;
  advisors: { solicitor: Advisor; accountant: Advisor };
  loan: LoanRequest;
  securities: SecurityProperty[];
  financials: {
    statement_for: string;
    liabilities: Liability[];
    assets: Asset[];
  };
  disclosures: Record<string, Disclosure>;
  declarations: {
    /** "I confirm that the above information is complete and correct." */
    info_confirmed: boolean;
    signatories: [Signatory, Signatory];
    purpose: {
      acknowledged: boolean;
      basis: PurposeBasis | null;
      signatories: [Signatory, Signatory];
    };
    privacy: {
      acknowledged: boolean;
      signatories: [Signatory, Signatory];
    };
  };
};

/** A persisted fact find (table row). */
export type FactFind = {
  id: string;
  applicant_name: string | null;
  status: string;
  contact_id: string | null;
  deal_id: string | null;
  loan_amount: number | null;
  referred_by: string | null;
  data: FactFindData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/* ── Empty template ──────────────────────────────────────────────────────── */

function emptyApplicant(): Applicant {
  return {
    title: "",
    family_name: "",
    given_names: "",
    capacity: "",
    address: "",
    postcode: "",
    phone_work: "",
    phone_home: "",
    email: "",
    date_of_birth: "",
    drivers_licence: "",
    occupation: "",
  };
}

function emptyAdvisor(withDx: boolean): Advisor {
  const base: Advisor = {
    firm: "",
    address: "",
    postcode: "",
    telephone: "",
    fax: "",
    contact_name: "",
  };
  return withDx ? { ...base, dx_number: "", dx_location: "" } : base;
}

export function emptySecurity(): SecurityProperty {
  return {
    address: "",
    suburb: "",
    postcode: "",
    folio_identifier: "",
    zoning: "",
    use: "",
    ownership: "",
    estimated_value: null,
    quick_valuation: false,
    rental_per_week: null,
    valuer_contact_name: "",
    phone_business: "",
    phone_after_hours: "",
    phone_mobile: "",
  };
}

/**
 * Stable row ids without Math.random/Date.now, so a fresh template is
 * deterministic (server and client render the same thing — no hydration drift).
 */
function rowId(prefix: string, n: number): string {
  return `${prefix}-${n}`;
}

export function emptyLiability(kind: LiabilityKind, n: number): Liability {
  return { id: rowId("liab", n), kind, label: "", balance: null, monthly: null };
}

export function emptyAsset(kind: AssetKind, n: number): Asset {
  return { id: rowId("asset", n), kind, label: "", value: null };
}

/** Seeds the exact rows the paper form pre-prints. */
function defaultLiabilities(): Liability[] {
  const kinds: LiabilityKind[] = [
    "Mortgage",
    "Mortgage",
    "Mortgage",
    "Car lease",
    "Car lease",
    "Overdraft",
    "Other loan",
    "Credit card",
    "Credit card",
  ];
  return kinds.map((k, i) => emptyLiability(k, i));
}

function defaultAssets(): Asset[] {
  const kinds: AssetKind[] = [
    "Property",
    "Property",
    "Property",
    "Cash at bank",
    "Deposit paid on property",
    "Motor vehicle",
    "Personal effects",
    "Superannuation",
    "Business value",
    "Shares and investments",
  ];
  return kinds.map((k, i) => emptyAsset(k, i));
}

function emptySignatory(): Signatory {
  return { name: "", date: "" };
}

export function emptyFactFind(): FactFindData {
  return {
    referred_by: "",
    applicants: [emptyApplicant(), emptyApplicant()],
    entity: {
      name: "",
      acn: "",
      entity_type: "",
      capacity: "",
      postal_address: "",
      postal_postcode: "",
      trading_address: "",
      trading_postcode: "",
      phone: "",
      fax: "",
      incorporation_date: "",
      principal_activity: "",
    },
    advisors: { solicitor: emptyAdvisor(true), accountant: emptyAdvisor(false) },
    loan: {
      amount_required: null,
      term_months: null,
      expected_settlement: "",
      purpose: "",
      repayment_strategy: "",
    },
    securities: [emptySecurity(), emptySecurity()],
    financials: {
      statement_for: "",
      liabilities: defaultLiabilities(),
      assets: defaultAssets(),
    },
    disclosures: Object.fromEntries(
      DISCLOSURE_QUESTIONS.map((q) => [q.key, { answer: null, details: "" } as Disclosure]),
    ),
    declarations: {
      info_confirmed: false,
      signatories: [emptySignatory(), emptySignatory()],
      purpose: { acknowledged: false, basis: null, signatories: [emptySignatory(), emptySignatory()] },
      privacy: { acknowledged: false, signatories: [emptySignatory(), emptySignatory()] },
    },
  };
}

/**
 * Merge a persisted blob over the current template. Older rows that predate a
 * field still open cleanly, and a blob missing whole sections can't crash the
 * form. Arrays are taken wholesale (they're user-ordered), not merged per-index.
 */
export function hydrateFactFind(raw: unknown): FactFindData {
  const base = emptyFactFind();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<FactFindData>;

  const disclosures = { ...base.disclosures };
  if (d.disclosures && typeof d.disclosures === "object") {
    for (const q of DISCLOSURE_QUESTIONS) {
      const got = (d.disclosures as Record<string, Disclosure>)[q.key];
      if (got && typeof got === "object") {
        disclosures[q.key] = {
          answer: got.answer === "yes" || got.answer === "no" ? got.answer : null,
          details: typeof got.details === "string" ? got.details : "",
        };
      }
    }
  }

  return {
    referred_by: d.referred_by ?? base.referred_by,
    applicants: (Array.isArray(d.applicants) && d.applicants.length === 2
      ? d.applicants.map((a) => ({ ...emptyApplicant(), ...a }))
      : base.applicants) as [Applicant, Applicant],
    entity: { ...base.entity, ...(d.entity ?? {}) },
    advisors: {
      solicitor: { ...base.advisors.solicitor, ...(d.advisors?.solicitor ?? {}) },
      accountant: { ...base.advisors.accountant, ...(d.advisors?.accountant ?? {}) },
    },
    loan: { ...base.loan, ...(d.loan ?? {}) },
    securities:
      Array.isArray(d.securities) && d.securities.length
        ? d.securities.map((s) => ({ ...emptySecurity(), ...s }))
        : base.securities,
    financials: {
      statement_for: d.financials?.statement_for ?? "",
      liabilities: Array.isArray(d.financials?.liabilities)
        ? d.financials.liabilities
        : base.financials.liabilities,
      assets: Array.isArray(d.financials?.assets) ? d.financials.assets : base.financials.assets,
    },
    disclosures,
    declarations: {
      info_confirmed: d.declarations?.info_confirmed ?? false,
      signatories: (d.declarations?.signatories ?? base.declarations.signatories) as [Signatory, Signatory],
      purpose: { ...base.declarations.purpose, ...(d.declarations?.purpose ?? {}) },
      privacy: { ...base.declarations.privacy, ...(d.declarations?.privacy ?? {}) },
    },
  };
}

/* ── Derived figures ─────────────────────────────────────────────────────── */

export type FactFindTotals = {
  totalLiabilities: number;
  totalAssets: number;
  /** Assets − liabilities. Negative when the applicant is underwater. */
  surplusAssets: number;
  /** Sum of the "@ per month" column — the servicing commitment. */
  monthlyCommitments: number;
};

const sum = (xs: (number | null | undefined)[]) =>
  xs.reduce<number>((t, v) => t + (typeof v === "number" && isFinite(v) ? v : 0), 0);

export function computeTotals(data: FactFindData): FactFindTotals {
  const totalLiabilities = sum(data.financials.liabilities.map((l) => l.balance));
  const totalAssets = sum(data.financials.assets.map((a) => a.value));
  return {
    totalLiabilities,
    totalAssets,
    surplusAssets: totalAssets - totalLiabilities,
    monthlyCommitments: sum(data.financials.liabilities.map((l) => l.monthly)),
  };
}

/** "$400,000" — whole dollars, the convention on the paper form. "" when unset. */
export function formatMoney(n: number | null | undefined): string {
  if (typeof n !== "number" || !isFinite(n)) return "";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

/** "Smith, John & Smith, Jane" — the list-view label. Empty applicants drop out. */
export function applicantSummary(data: FactFindData): string {
  return data.applicants
    .map((a) => [a.family_name.trim(), a.given_names.trim()].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" & ");
}

/**
 * Sections still missing something before this can be called Complete.
 * Advisory only — nothing here blocks a save, since a fact find is filled in
 * over several conversations.
 */
export function outstandingSections(data: FactFindData): string[] {
  const missing: string[] = [];
  const a = data.applicants[0];
  if (!a.family_name.trim() || !a.given_names.trim()) missing.push("Applicant 1 name");
  if (!a.date_of_birth) missing.push("Applicant 1 date of birth");
  if (!a.address.trim()) missing.push("Applicant 1 home address");
  if (data.loan.amount_required == null) missing.push("Loan amount required");
  if (!data.loan.purpose.trim()) missing.push("Loan purpose");
  if (!data.loan.repayment_strategy.trim()) missing.push("Loan repayment strategy");
  if (!data.securities.some((s) => s.address.trim())) missing.push("At least one security property");
  if (DISCLOSURE_QUESTIONS.some((q) => data.disclosures[q.key]?.answer == null))
    missing.push("All disclosure questions answered");
  if (!data.declarations.info_confirmed) missing.push("Declaration confirmed");
  if (!data.declarations.privacy.acknowledged) missing.push("Privacy consent acknowledged");
  return missing;
}

/* ── Supabase plumbing ───────────────────────────────────────────────────── */

/**
 * Human message from a Supabase PostgrestError, falling back to `errMessage`.
 *
 * Not a second copy of `errMessage` — a delegation to it. A PostgrestError is a
 * plain object, not an `Error`, so `errMessage` alone returns the fallback and
 * discards what the database actually said (the regression cc4fc7b fixed).
 * Read the Postgrest fields first; hand everything else to the shared helper.
 */
export function factFindErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return errMessage(e, fallback);
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || errMessage(e, fallback);
}

/**
 * True when the failure is just "table not created yet" (migration not run).
 *
 * Deliberately narrow. A missing *column* reports as PGRST204 ("Could not find
 * the 'x' column … in the schema cache") or 42703 ("column … does not exist") —
 * both of which the obvious loose `schema cache` / `does not exist` substring
 * test swallows, telling the operator to run a migration they have already run.
 * Match the table-level codes, and only fall back to a substring test that
 * names a *table*.
 */
export function factFindsTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  // Column-level failures are a schema mismatch, not an unmigrated table.
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
