/**
 * AML/CTF domain module — single source of truth for the AUSTRAC compliance
 * feature (Tranche-2 real-estate obligations, in force 1 July 2026).
 *
 * Everything here is PURE (no I/O) so it can be unit-tested without a DB and
 * shared verbatim by the API routes and the client forms. It defines:
 *
 *   - The CDD "case" blob (utils/factfind.ts-style `data` jsonb) that captures
 *     Customer Due Diligence on one party (buyer/seller) to one transaction,
 *     entity-type aware (individual / company / trust / SMSF, incl. 25%+
 *     beneficial owners), source of funds, verification + screening summary,
 *     and a derived risk rating.
 *   - The report model (SMR / TTR / IFTI) with the statutory deadlines.
 *   - The screening list vocabulary (DFAT / UN / OFAC / EU / UK HMT / PEP /
 *     adverse media).
 *   - The AML/CTF program + enterprise risk-assessment shape (governance,
 *     AUSTRAC enrolment, compliance officer, 7-year record retention).
 *
 * NOTE (not legal advice): the field set and deadlines encode AUSTRAC's stated
 * obligations, but the definitive requirement is the AML/CTF Act and AUSTRAC
 * guidance — keep this in step with them and the business's own program.
 */

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

export const PARTY_TYPES = ["individual", "company", "trust", "smsf"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  individual: "Individual",
  company: "Company",
  trust: "Trust",
  smsf: "SMSF",
};

export const PARTY_ROLES = ["buyer", "seller", "other"] as const;
export type PartyRole = (typeof PARTY_ROLES)[number];

export const RISK_RATINGS = ["low", "medium", "high"] as const;
export type RiskRating = (typeof RISK_RATINGS)[number];

/**
 * Case status. Progresses Draft → In Progress → Screening → (Enhanced DD) →
 * Cleared | Blocked. "Cleared" is the TERMINAL (sign-locked) status — a finished
 * CDD determination is read-only via the shared compliance sign-lock, and must
 * be reopened to amend, leaving an audit trail. "Blocked" (a confirmed sanctions
 * / adverse outcome) stays editable so the escalation can be worked.
 */
export const AML_CASE_STATUSES = [
  "Draft",
  "In Progress",
  "Screening",
  "Enhanced DD",
  "Cleared",
  "Blocked",
] as const;
export type CaseStatus = (typeof AML_CASE_STATUSES)[number];

/** The status at which a CDD case is complete and becomes read-only. */
export const AML_CASE_TERMINAL_STATUS: CaseStatus = "Cleared";

export const ID_DOCUMENT_TYPES = ["passport", "drivers_licence", "other"] as const;
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];

export const ID_DOCUMENT_LABELS: Record<IdDocumentType, string> = {
  passport: "Passport",
  drivers_licence: "Driver's licence",
  other: "Other government ID",
};

/**
 * Screening lists every party + 25%+ beneficial owner must be checked against,
 * on onboarding AND on an ongoing basis (screening continues throughout the
 * transaction, not just at onboarding).
 */
export const SCREENING_LISTS = [
  { code: "DFAT", label: "DFAT Australian Consolidated Sanctions List" },
  { code: "UN", label: "UN Security Council Sanctions List" },
  { code: "OFAC", label: "OFAC (US) Specially Designated Nationals" },
  { code: "EU", label: "EU Consolidated Sanctions List" },
  { code: "UK_HMT", label: "UK HMT Sanctions List" },
  { code: "PEP", label: "Politically Exposed Persons (foreign/domestic/international)" },
  { code: "ADVERSE_MEDIA", label: "Adverse media (all countries and languages)" },
] as const;
export type ScreeningListCode = (typeof SCREENING_LISTS)[number]["code"];

/** All screening list codes — the default set to run on every subject. */
export const ALL_SCREENING_LIST_CODES: ScreeningListCode[] = SCREENING_LISTS.map((l) => l.code);

export const SCREENING_RESULTS = ["pending", "clear", "potential_match", "confirmed_match"] as const;
export type ScreeningResult = (typeof SCREENING_RESULTS)[number];

export const SOURCE_OF_FUNDS_CATEGORIES = [
  "savings",
  "sale_of_property",
  "sale_of_asset",
  "gift",
  "inheritance",
  "loan",
  "business_income",
  "investment",
  "superannuation",
  "other",
] as const;
export type SourceOfFundsCategory = (typeof SOURCE_OF_FUNDS_CATEGORIES)[number];

export const SOURCE_OF_FUNDS_LABELS: Record<SourceOfFundsCategory, string> = {
  savings: "Accumulated savings",
  sale_of_property: "Sale of property",
  sale_of_asset: "Sale of other asset",
  gift: "Gift",
  inheritance: "Inheritance",
  loan: "Loan / mortgage",
  business_income: "Business income",
  investment: "Investment proceeds",
  superannuation: "Superannuation",
  other: "Other",
};

/* ── Reports (AUSTRAC Online) ────────────────────────────────────────────── */

export const REPORT_TYPES = [
  {
    code: "SMR",
    label: "Suspicious Matter Report",
    /** 3 business days from forming suspicion; 24 hours if terrorism-related. */
    deadlineBusinessDays: 3,
    terrorismHours: 24,
    trigger: "Suspicion formed about a client or transaction",
    /** SMRs engage the tipping-off offence — never tell the client one exists. */
    confidential: true,
  },
  {
    code: "TTR",
    label: "Threshold Transaction Report",
    deadlineBusinessDays: 10,
    terrorismHours: null,
    trigger: "AUD 10,000 or more in physical cash received or paid",
    confidential: false,
  },
  {
    code: "IFTI",
    label: "International Funds Transfer Instruction",
    deadlineBusinessDays: 10,
    terrorismHours: null,
    trigger: "Funds instruction sent or received across an international border",
    confidential: false,
  },
] as const;
export type ReportType = (typeof REPORT_TYPES)[number]["code"];

export const REPORT_STATUSES = ["draft", "ready", "lodged"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** The physical-cash threshold (AUD) that triggers a TTR. */
export const CASH_THRESHOLD_AUD = 10_000;

/** Records must be kept for 7 years after the transaction / relationship ends. */
export const RECORD_RETENTION_YEARS = 7;

export function reportTypeMeta(code: ReportType) {
  const meta = REPORT_TYPES.find((r) => r.code === code);
  if (!meta) throw new Error(`Unknown report type: ${code}`);
  return meta;
}

/* ── CDD case blob ───────────────────────────────────────────────────────── */

export type AmlAddress = {
  line1: string;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
};

export type AmlIdDocument = {
  type: IdDocumentType;
  number: string;
  expiry: string;
  country: string;
  verified: boolean;
};

/** A 25%+ beneficial owner / controller of a company, trust or SMSF. */
export type BeneficialOwner = {
  fullLegalName: string;
  dob: string;
  ownershipPercent: number | null;
  /** e.g. "Director", "Trustee", "Shareholder", "Member", "Settlor". */
  role: string;
  verified: boolean;
};

export type SourceOfFunds = {
  category: SourceOfFundsCategory | "";
  description: string;
  verified: boolean;
};

export type VerificationStatus = "not_started" | "pending" | "verified" | "failed";

export type Verification = {
  /** e.g. "first_aml" or "manual". */
  provider: string;
  status: VerificationStatus;
  reference: string;
  verifiedAt: string;
};

export type ScreeningSummary = {
  status: ScreeningResult;
  lastScreenedAt: string;
  lists: ScreeningListCode[];
};

export type EntityDetails = {
  // Individual (also the authorised individual acting for an entity)
  fullLegalName: string;
  dob: string;
  residentialAddress: AmlAddress;
  idDocument: AmlIdDocument;
  // Company
  companyName: string;
  acnAbn: string;
  registeredOffice: AmlAddress;
  // Trust / SMSF
  trustName: string;
  trustType: string;
  fundName: string;
};

export type RiskFactors = {
  pep: boolean;
  highRiskCountry: boolean;
  cashIntensive: boolean;
  complexStructure: boolean;
  notes: string;
};

export type AmlCaseData = {
  partyType: PartyType;
  partyRole: PartyRole;
  entity: EntityDetails;
  beneficialOwners: BeneficialOwner[];
  sourceOfFunds: SourceOfFunds;
  verification: Verification;
  screening: ScreeningSummary;
  riskRating: RiskRating;
  riskFactors: RiskFactors;
  notes: string;
};

function emptyAddress(): AmlAddress {
  return { line1: "", suburb: "", state: "", postcode: "", country: "Australia" };
}

export function emptyAmlCase(partyType: PartyType = "individual"): AmlCaseData {
  return {
    partyType,
    partyRole: "buyer",
    entity: {
      fullLegalName: "",
      dob: "",
      residentialAddress: emptyAddress(),
      idDocument: { type: "drivers_licence", number: "", expiry: "", country: "Australia", verified: false },
      companyName: "",
      acnAbn: "",
      registeredOffice: emptyAddress(),
      trustName: "",
      trustType: "",
      fundName: "",
    },
    beneficialOwners: [],
    sourceOfFunds: { category: "", description: "", verified: false },
    verification: { provider: "manual", status: "not_started", reference: "", verifiedAt: "" },
    screening: { status: "pending", lastScreenedAt: "", lists: [] },
    riskRating: "low",
    riskFactors: { pep: false, highRiskCountry: false, cashIntensive: false, complexStructure: false, notes: "" },
    notes: "",
  };
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asBool(v: unknown): boolean {
  return v === true;
}
function asNumOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function hydrateAddress(raw: unknown): AmlAddress {
  const base = emptyAddress();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    line1: asString(o.line1, base.line1),
    suburb: asString(o.suburb, base.suburb),
    state: asString(o.state, base.state),
    postcode: asString(o.postcode, base.postcode),
    country: asString(o.country, base.country),
  };
}

/**
 * Merge a stored (possibly partial or older-shape) blob over a fresh template,
 * so a case saved before a field existed still opens cleanly. Mirrors
 * utils/factfind.ts `hydrateFactFind`.
 */
export function hydrateAmlCase(raw: unknown): AmlCaseData {
  const partyType = oneOf(
    (raw as Record<string, unknown> | null)?.partyType,
    PARTY_TYPES,
    "individual",
  );
  const base = emptyAmlCase(partyType);
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const e = (o.entity ?? {}) as Record<string, unknown>;
  const idDoc = (e.idDocument ?? {}) as Record<string, unknown>;
  const sof = (o.sourceOfFunds ?? {}) as Record<string, unknown>;
  const ver = (o.verification ?? {}) as Record<string, unknown>;
  const scr = (o.screening ?? {}) as Record<string, unknown>;
  const rf = (o.riskFactors ?? {}) as Record<string, unknown>;

  const bos = Array.isArray(o.beneficialOwners) ? o.beneficialOwners : [];
  const lists = Array.isArray(scr.lists)
    ? (scr.lists.filter((c): c is ScreeningListCode =>
        ALL_SCREENING_LIST_CODES.includes(c as ScreeningListCode)) as ScreeningListCode[])
    : [];

  return {
    partyType,
    partyRole: oneOf(o.partyRole, PARTY_ROLES, "buyer"),
    entity: {
      fullLegalName: asString(e.fullLegalName),
      dob: asString(e.dob),
      residentialAddress: hydrateAddress(e.residentialAddress),
      idDocument: {
        type: oneOf(idDoc.type, ID_DOCUMENT_TYPES, "drivers_licence"),
        number: asString(idDoc.number),
        expiry: asString(idDoc.expiry),
        country: asString(idDoc.country, "Australia"),
        verified: asBool(idDoc.verified),
      },
      companyName: asString(e.companyName),
      acnAbn: asString(e.acnAbn),
      registeredOffice: hydrateAddress(e.registeredOffice),
      trustName: asString(e.trustName),
      trustType: asString(e.trustType),
      fundName: asString(e.fundName),
    },
    beneficialOwners: bos.map((b) => {
      const bo = (b ?? {}) as Record<string, unknown>;
      return {
        fullLegalName: asString(bo.fullLegalName),
        dob: asString(bo.dob),
        ownershipPercent: asNumOrNull(bo.ownershipPercent),
        role: asString(bo.role),
        verified: asBool(bo.verified),
      };
    }),
    sourceOfFunds: {
      category: oneOf(sof.category, [...SOURCE_OF_FUNDS_CATEGORIES, ""] as const, ""),
      description: asString(sof.description),
      verified: asBool(sof.verified),
    },
    verification: {
      provider: asString(ver.provider, "manual"),
      status: oneOf(ver.status, ["not_started", "pending", "verified", "failed"] as const, "not_started"),
      reference: asString(ver.reference),
      verifiedAt: asString(ver.verifiedAt),
    },
    screening: {
      status: oneOf(scr.status, SCREENING_RESULTS, "pending"),
      lastScreenedAt: asString(scr.lastScreenedAt),
      lists,
    },
    riskRating: oneOf(o.riskRating, RISK_RATINGS, "low"),
    riskFactors: {
      pep: asBool(rf.pep),
      highRiskCountry: asBool(rf.highRiskCountry),
      cashIntensive: asBool(rf.cashIntensive),
      complexStructure: asBool(rf.complexStructure),
      notes: asString(rf.notes),
    },
    notes: asString(o.notes),
  };
}

/* ── Derived logic ───────────────────────────────────────────────────────── */

/** A short human label for the party, used on the list view. */
export function partySummary(data: AmlCaseData): string {
  const e = data.entity;
  switch (data.partyType) {
    case "company":
      return e.companyName || "Unnamed company";
    case "trust":
      return e.trustName || "Unnamed trust";
    case "smsf":
      return e.fundName || "Unnamed SMSF";
    default:
      return e.fullLegalName || "Unnamed individual";
  }
}

function addressComplete(a: AmlAddress): boolean {
  return Boolean(a.line1 && a.suburb && a.state && a.postcode && a.country);
}

/**
 * Which CDD fields are still missing for this party type. Covers the identity
 * and source-of-funds requirements; screening completeness is tracked separately
 * on `data.screening.status`.
 */
export function cddCompleteness(data: AmlCaseData): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  const e = data.entity;

  const requireIndividual = () => {
    if (!e.fullLegalName) missing.push("Full legal name");
    if (!e.dob) missing.push("Date of birth");
    if (!addressComplete(e.residentialAddress)) missing.push("Residential address");
    if (!e.idDocument.number) missing.push("Identity document");
  };

  if (data.partyType === "individual") {
    requireIndividual();
  } else {
    // Non-individuals: verify the entity AND its 25%+ beneficial owners.
    if (data.partyType === "company") {
      if (!e.companyName) missing.push("Company name");
      if (!e.acnAbn) missing.push("ACN / ABN");
      if (!addressComplete(e.registeredOffice)) missing.push("Registered office");
    }
    if (data.partyType === "trust") {
      if (!e.trustName) missing.push("Trust name");
      if (!e.trustType) missing.push("Trust type");
    }
    if (data.partyType === "smsf") {
      if (!e.fundName) missing.push("SMSF name");
    }
    if (data.beneficialOwners.length === 0) {
      missing.push("At least one beneficial owner / controller");
    } else if (data.beneficialOwners.some((b) => !b.fullLegalName)) {
      missing.push("Beneficial owner name");
    }
  }

  if (!data.sourceOfFunds.category) missing.push("Source of funds");

  return { complete: missing.length === 0, missing };
}

/**
 * Derive a risk rating from the captured risk factors and entity type. A simple,
 * explainable scoring model (not a substitute for the program's risk
 * methodology): sanctions/PEP/high-risk-geography weigh heaviest; complex
 * structures and cash intensity add; non-individual entities carry a baseline.
 */
export function deriveRiskRating(data: AmlCaseData): RiskRating {
  let score = 0;
  if (data.partyType !== "individual") score += 1;
  // A PEP is inherently high-risk under AUSTRAC guidance — enough on its own.
  if (data.riskFactors.pep) score += 3;
  if (data.riskFactors.highRiskCountry) score += 2;
  if (data.riskFactors.cashIntensive) score += 1;
  if (data.riskFactors.complexStructure) score += 1;
  if (data.screening.status === "potential_match") score += 2;
  if (data.screening.status === "confirmed_match") score += 5;
  if (score >= 3) return "high";
  if (score >= 1) return "medium";
  return "low";
}

/**
 * Enhanced CDD is required for high-risk customers — a PEP, a high-risk
 * geography, a confirmed/potential screening hit, or an overall high rating.
 */
export function needsEnhancedDd(data: AmlCaseData): boolean {
  return (
    deriveRiskRating(data) === "high" ||
    data.riskFactors.pep ||
    data.riskFactors.highRiskCountry ||
    data.screening.status === "potential_match" ||
    data.screening.status === "confirmed_match"
  );
}

/** Every subject that must be screened: the party plus each beneficial owner. */
export function screeningSubjects(data: AmlCaseData): { name: string; kind: "party" | "beneficial_owner" }[] {
  const subjects: { name: string; kind: "party" | "beneficial_owner" }[] = [];
  const primary = partySummary(data);
  if (primary && !primary.startsWith("Unnamed")) subjects.push({ name: primary, kind: "party" });
  // For a non-individual the acting individual is on the entity too.
  if (data.partyType !== "individual" && data.entity.fullLegalName) {
    subjects.push({ name: data.entity.fullLegalName, kind: "beneficial_owner" });
  }
  for (const bo of data.beneficialOwners) {
    if (bo.fullLegalName) subjects.push({ name: bo.fullLegalName, kind: "beneficial_owner" });
  }
  return subjects;
}

/* ── Deadlines (business-day math) ───────────────────────────────────────── */

/** UTC midnight of an ISO date/timestamp, so day math is DST-proof. */
function utcMidnight(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Add N business days (Mon–Fri) to a date. Does NOT account for public holidays
 * — AUSTRAC deadlines exclude national public holidays, so treat the result as
 * the LATEST safe date and lodge earlier where a holiday intervenes.
 */
export function addBusinessDays(iso: string, businessDays: number): string {
  const d = utcMidnight(iso);
  let added = 0;
  while (added < businessDays) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay(); // 0 Sun … 6 Sat
    if (day !== 0 && day !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

/** Add N calendar days to a date (for the 24-hour terrorism SMR deadline). */
export function addCalendarDays(iso: string, days: number): string {
  const d = utcMidnight(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The statutory due date for a report given its trigger date. SMR = 3 business
 * days (or within 24 hours ⇒ next day, when terrorism-related); TTR & IFTI = 10
 * business days.
 */
export function reportDueDate(type: ReportType, triggerISO: string, terrorismRelated = false): string {
  const meta = reportTypeMeta(type);
  if (type === "SMR" && terrorismRelated) return addCalendarDays(triggerISO, 1);
  return addBusinessDays(triggerISO, meta.deadlineBusinessDays);
}

/** Whole days from today until an ISO date (negative when overdue). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const target = utcMidnight(iso).getTime();
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((target - now) / 86_400_000);
}

/** The date until which records for a case created on `iso` must be retained. */
export function retentionUntil(iso: string): string {
  const d = utcMidnight(iso);
  d.setUTCFullYear(d.getUTCFullYear() + RECORD_RETENTION_YEARS);
  return d.toISOString().slice(0, 10);
}

/* ── AML/CTF program + enterprise risk assessment ────────────────────────── */

export type EnrolmentStatus = "not_started" | "in_progress" | "enrolled";

export type RiskAssessmentDimension = {
  rating: RiskRating;
  notes: string;
};

export type AmlProgramData = {
  enrolment: {
    status: EnrolmentStatus;
    austracReference: string;
    enrolledAt: string;
    /** AUSTRAC must be told the compliance officer within 14 days of enrolling. */
    officerNotifiedAt: string;
  };
  complianceOfficer: {
    name: string;
    email: string;
    appointedAt: string;
  };
  programApproved: {
    approvedBy: string;
    approvedAt: string;
    version: string;
  };
  /** Enterprise risk assessment across the four AUSTRAC risk vectors. */
  riskAssessment: {
    customer: RiskAssessmentDimension;
    transaction: RiskAssessmentDimension;
    channel: RiskAssessmentDimension;
    geographic: RiskAssessmentDimension;
  };
  /** ISO date the program is next due for review (annual report from 2027). */
  reviewDue: string;
  notes: string;
};

export function emptyProgram(): AmlProgramData {
  const dim = (): RiskAssessmentDimension => ({ rating: "low", notes: "" });
  return {
    enrolment: { status: "not_started", austracReference: "", enrolledAt: "", officerNotifiedAt: "" },
    complianceOfficer: { name: "", email: "", appointedAt: "" },
    programApproved: { approvedBy: "", approvedAt: "", version: "1.0" },
    riskAssessment: { customer: dim(), transaction: dim(), channel: dim(), geographic: dim() },
    reviewDue: "",
    notes: "",
  };
}

export function hydrateProgram(raw: unknown): AmlProgramData {
  const base = emptyProgram();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const enr = (o.enrolment ?? {}) as Record<string, unknown>;
  const co = (o.complianceOfficer ?? {}) as Record<string, unknown>;
  const pa = (o.programApproved ?? {}) as Record<string, unknown>;
  const ra = (o.riskAssessment ?? {}) as Record<string, unknown>;
  const dim = (v: unknown): RiskAssessmentDimension => {
    const d = (v ?? {}) as Record<string, unknown>;
    return { rating: oneOf(d.rating, RISK_RATINGS, "low"), notes: asString(d.notes) };
  };
  return {
    enrolment: {
      status: oneOf(enr.status, ["not_started", "in_progress", "enrolled"] as const, "not_started"),
      austracReference: asString(enr.austracReference),
      enrolledAt: asString(enr.enrolledAt),
      officerNotifiedAt: asString(enr.officerNotifiedAt),
    },
    complianceOfficer: {
      name: asString(co.name),
      email: asString(co.email),
      appointedAt: asString(co.appointedAt),
    },
    programApproved: {
      approvedBy: asString(pa.approvedBy),
      approvedAt: asString(pa.approvedAt),
      version: asString(pa.version, "1.0"),
    },
    riskAssessment: {
      customer: dim(ra.customer),
      transaction: dim(ra.transaction),
      channel: dim(ra.channel),
      geographic: dim(ra.geographic),
    },
    reviewDue: asString(o.reviewDue),
    notes: asString(o.notes),
  };
}

/**
 * The compliance-officer notification deadline (14 days after enrolment). Empty
 * string when not yet enrolled.
 */
export function officerNotifyDue(program: AmlProgramData): string {
  if (!program.enrolment.enrolledAt) return "";
  return addCalendarDays(program.enrolment.enrolledAt, 14);
}

/* ── Error / migration helpers (mirrors utils/factfind.ts) ───────────────── */

export function amlErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message || fallback;
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/**
 * True when the failure is just "table not created yet" (migration not run).
 * Deliberately narrow — a missing COLUMN (PGRST204 / 42703) is a schema
 * mismatch, not an unmigrated table, and must not be swallowed here.
 */
export function amlTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
