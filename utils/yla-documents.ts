/**
 * The document set Your Loan Assist require before a Preliminary Assessment can
 * be completed, and the naming/format standard they apply to each file.
 *
 * Source: YLA Programs -> Glenn, 2026-07-20, plus "Operational Guidelines for
 * Documentation" (in the YLA OneDrive folder). YLA reject the WHOLE set if
 * anything is missing or substandard — "we run like a bank" — and a rejected
 * set costs a full week, because leads submitted on Thursday are assessed the
 * Thursday after. Everything here exists to stop that happening.
 *
 * Keep in step with migrations/20260720_client_document_portal.sql.
 */

export type DocSpec = {
  /** Stable slug stored in client_documents.doc_type. Never change these. */
  key: string;
  /** What the client sees. */
  label: string;
  /** Plain-language help — this is the difference between a good upload and a week's delay. */
  hint: string;
  /** True when YLA want one per applicant (payslips, ID, super). */
  perApplicant: boolean;
  /** How many of this document are required (per applicant when perApplicant). */
  count: number;
  /** Base filename YLA see, before we append an index and surname. */
  filenameBase: string;
};

export const YLA_DOCUMENTS: DocSpec[] = [
  {
    key: "fact_find",
    label: "Fact Find (CNA)",
    hint: "The completed fact find. Your Springboard contact usually supplies this — upload it here if you have been sent a copy to sign.",
    perApplicant: false,
    count: 1,
    filenameBase: "CNA Fact Find",
  },
  {
    key: "payslip",
    label: "Recent payslips",
    hint: "Your two most recent payslips. Download them from your payroll system rather than photographing a printout.",
    perApplicant: true,
    count: 2,
    filenameBase: "Payslip",
  },
  {
    key: "photo_id",
    label: "Photo ID",
    hint: "Driver licence or passport. If it is a licence we need BOTH the front and the back — upload them as two files.",
    perApplicant: true,
    count: 2,
    filenameBase: "Photo ID",
  },
  {
    key: "ato_income",
    label: "ATO Income Statement",
    hint: "Both the previous and the current financial year. Use the step-by-step myGov guide below if you're not sure how to get it.",
    perApplicant: false,
    count: 2,
    filenameBase: "ATO Income Statement",
  },
  {
    key: "credit_auth",
    label: "Credit File authorisation",
    hint: "The authorisation form, signed by every applicant. Your Springboard contact will send this to you to sign.",
    perApplicant: false,
    count: 1,
    filenameBase: "Credit File Authorisation",
  },
  {
    key: "super_statement",
    label: "Super statement",
    hint: "Your most recent superannuation statement, from myGov or your fund's website.",
    perApplicant: true,
    count: 1,
    filenameBase: "Super Statement",
  },
];

export const DOC_BY_KEY: Record<string, DocSpec> = Object.fromEntries(
  YLA_DOCUMENTS.map((d) => [d.key, d]),
);

/** YLA's hard ceiling. Anything above this is rejected on sight. */
export const YLA_MAX_BYTES = 1024 * 1024;

/** What we accept from the client before normalising. */
export const ACCEPTED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

export type RequiredSlot = {
  docKey: string;
  label: string;
  hint: string;
  /** 1-based applicant, or null for whole-application documents. */
  applicantIndex: number | null;
  /** 1-based index within this doc type, e.g. payslip 1 and 2. */
  slot: number;
};

/**
 * Expand the spec into the concrete list of files required for a given number
 * of applicants. This is what the portal renders and what the completeness
 * check counts against — one list, so the client and the rep can never
 * disagree about what is outstanding.
 */
export function requiredSlots(applicantCount: number): RequiredSlot[] {
  const n = Math.max(1, Math.min(4, applicantCount || 1));
  const out: RequiredSlot[] = [];
  for (const doc of YLA_DOCUMENTS) {
    const applicants = doc.perApplicant ? Array.from({ length: n }, (_, i) => i + 1) : [null];
    for (const applicantIndex of applicants) {
      for (let slot = 1; slot <= doc.count; slot++) {
        out.push({
          docKey: doc.key,
          label: doc.label,
          hint: doc.hint,
          applicantIndex,
          slot,
        });
      }
    }
  }
  return out;
}

/**
 * Build the filename YLA see. Their standard is "named to reflect the
 * document" — "Payslip 1", "Super Statement" — so we generate it rather than
 * trusting whatever the phone called it (IMG_4821.pdf is an instant rejection).
 */
/** Surname from a full name, upper-case-preserving as typed. "" when blank. */
export function surnameOf(fullName: string | null | undefined): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? "";
}

/**
 * The surname to stamp on a given applicant's files. Applicant 1 uses the
 * primary name; applicant 2 uses applicant2_name when we have it, so a couple's
 * documents aren't all named after one person. Falls back to the primary
 * surname if a second name wasn't captured.
 */
export function surnameForApplicant(
  applicantIndex: number | null,
  applicantName: string,
  applicant2Name: string | null | undefined,
): string {
  if (applicantIndex === 2 && applicant2Name && applicant2Name.trim()) {
    return surnameOf(applicant2Name);
  }
  return surnameOf(applicantName);
}

export function ylaFilename(
  docKey: string,
  slot: number,
  surname: string | null,
  applicantIndex: number | null,
  clientRef?: string | null,
): string {
  const spec = DOC_BY_KEY[docKey];
  const base = spec?.filenameBase ?? docKey.replace(/_/g, " ");
  const parts: string[] = [base];

  // Only number it when more than one is expected — "Super Statement" reads
  // better than "Super Statement 1".
  if ((spec?.count ?? 1) > 1) parts.push(String(slot));

  if (docKey === "photo_id") {
    // YLA specifically want licence front and back distinguishable.
    parts.push(slot === 1 ? "Front" : "Back");
  }

  const clean = (surname || "").replace(/[^\w\- ]+/g, "").trim();
  let name = parts.join(" ");
  if (clean) name += ` - ${clean}`;
  else if (applicantIndex) name += ` - Applicant ${applicantIndex}`;

  // The NK reference disambiguates two clients with the same surname. Kept in
  // parentheses so it reads as a tag, not part of the document name itself.
  const ref = (clientRef || "").trim();
  if (ref) name += ` (${ref})`;

  return `${name}.pdf`;
}
