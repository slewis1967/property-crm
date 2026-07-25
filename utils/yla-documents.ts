/**
 * The PERSONAL document set one applicant provides for a Preliminary
 * Assessment, and the naming/format standard YLA apply to each file.
 *
 * Model (2026-07-21): each applicant gets their OWN request/portal link and
 * uploads only their own personal documents. The application-level documents
 * (Fact Find, Credit File authorisation) are NOT client uploads — the rep/YLA
 * handle those separately — so they are intentionally absent from this set.
 *
 * Source: YLA Programs -> Glenn, 2026-07-20, plus "Operational Guidelines for
 * Documentation". YLA reject the whole set if anything is missing or
 * substandard ("we run like a bank"), and a rejected set costs a week — so the
 * portal normalises everything before it reaches them.
 *
 * Keep in step with migrations/20260720_client_document_portal.sql.
 */

export type DocSpec = {
  /** Stable slug stored in client_documents.doc_type. Never change these. */
  key: string;
  /** What the client sees. */
  label: string;
  /** Plain-language help — the difference between a good upload and a week's delay. */
  hint: string;
  /** How many of this document are required. */
  count: number;
  /** Base filename YLA see, before we append an index and surname. */
  filenameBase: string;
};

export const YLA_DOCUMENTS: DocSpec[] = [
  {
    key: "payslip",
    label: "Recent payslips",
    hint: "Your two most recent payslips. Download them from your payroll system rather than photographing a printout.",
    count: 2,
    filenameBase: "Payslip",
  },
  {
    key: "photo_id",
    label: "Photo ID",
    hint: "Driver licence or passport. If it is a licence we need BOTH the front and the back — upload them as two files.",
    count: 2,
    filenameBase: "Photo ID",
  },
  {
    key: "ato_income",
    label: "ATO Income Statement",
    hint:
      "The payment summary you download from the ATO section of your myGov account — not your tax return, and not a summary from your employer. " +
      "We need the previous and the current financial year. myGov lists one statement per employer, so if you had two jobs in a year, upload both of that year's statements. " +
      "Use the step-by-step myGov guide below if you're not sure how to get them.",
    count: 2,
    filenameBase: "ATO Income Statement",
  },
  {
    key: "super_statement",
    label: "Super statement",
    hint: "Your most recent superannuation statement, from myGov or your fund's website.",
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
  /** 1-based index within this doc type, e.g. payslip 1 and 2. */
  slot: number;
};

/**
 * The concrete list of files one applicant must provide. A request is always a
 * single applicant now, so this takes no count — the portal renders it and the
 * completeness check counts against it, one list so client and rep can never
 * disagree about what is outstanding.
 */
export function requiredSlots(): RequiredSlot[] {
  const out: RequiredSlot[] = [];
  for (const doc of YLA_DOCUMENTS) {
    for (let slot = 1; slot <= doc.count; slot++) {
      out.push({ docKey: doc.key, label: doc.label, hint: doc.hint, slot });
    }
  }
  return out;
}

/** Surname from a full name, preserving case as typed. "" when blank. */
export function surnameOf(fullName: string | null | undefined): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0] ?? "";
}

/**
 * Build the filename YLA see. Their standard is "named to reflect the
 * document" — "Payslip 1", "Super Statement" — so we generate it rather than
 * trusting whatever the phone called it (IMG_4821.pdf is an instant rejection).
 * `surname` is the applicant's; `clientRef` is the application reference, shared
 * by both applicants so their files sort together in the one folder.
 */
export function ylaFilename(
  docKey: string,
  slot: number,
  surname: string | null,
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

  // The NK reference disambiguates two clients with the same surname. Kept in
  // parentheses so it reads as a tag, not part of the document name itself.
  const ref = (clientRef || "").trim();
  if (ref) name += ` (${ref})`;

  return `${name}.pdf`;
}

/**
 * The filename for an APPLICATION-level document — the signed Needs Analysis
 * and Credit File Authorisation, which the CRM produces rather than the client
 * uploading (see utils/yla-package.ts).
 *
 * These land in the same Drive folder as the client's files, and YLA's standard
 * is "named to reflect the document", so they take the same shape as
 * ylaFilename(): "<Document> - <Surname> (NK-10010).pdf".
 */
export function packageFilename(
  base: string,
  applicantName: string | null,
  clientRef: string | null,
): string {
  const surname = (surnameOf(applicantName) || (applicantName ?? "")).replace(/[^\w\- ]+/g, "").trim();
  let name = base;
  if (surname) name += ` - ${surname}`;
  const ref = (clientRef || "").trim();
  if (ref) name += ` (${ref})`;
  return `${name}.pdf`;
}
