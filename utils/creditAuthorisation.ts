/**
 * Shared schema, types and pure helpers for the Credit File Authorisation
 * (credit_authorisations) — the Equifax "Access Seeker Report – Client Privacy
 * Consent Form".
 *
 * Unlike the Borrower Fact Find, this document is almost entirely FIXED LEGAL
 * TEXT (see CREDIT_AUTHORISATION_TEXT). The applicant only fills in their
 * name(s), their address, and signs/dates. It is a print-to-sign consent form.
 *
 * Everything the form captures lives in the `data` jsonb blob; the table's
 * top-level columns (names, status…) are denormalised copies kept only so the
 * list view can render without parsing every blob.
 *
 * CREDIT_AUTHORISATION_TEXT is reproduced VERBATIM from the source Equifax
 * consent form. Treat it as legal copy — do not paraphrase, reword or "improve"
 * a single character of it without sign-off from the Licensor.
 */

import { errMessage } from "./errors";

/* ── Enumerations ────────────────────────────────────────────────────────── */

export const CREDIT_AUTHORISATION_STATUSES = ["draft", "signed"] as const;
export type CreditAuthorisationStatus = (typeof CREDIT_AUTHORISATION_STATUSES)[number];

/* ── The fixed legal text (VERBATIM — do not edit) ───────────────────────── */

/**
 * The Equifax Access Seeker consent wording, reproduced exactly. The `body`
 * paragraph reads "I <names> of <address> authorise…" — the `names` and
 * `address` fields the applicant fills in slot in ahead of the `body` string,
 * which is why `body` opens on the lower-case word "authorise".
 */
export const CREDIT_AUTHORISATION_TEXT = {
  title: "Equifax Access Seeker Report – Client Privacy Consent Form",
  heading: "Access Seeker Customer Authorisation",
  body: "authorise Your Loan Assist and its authorised personnel Paul Wiwatowski (hereinafter “The Broker) to act as Access Seeker within the meaning of section 6L of the Privacy Act 1988 (Cth) and to seek to obtain credit reporting information on my behalf to assist me with determining which credit product is most suitable for me and to assist me with obtaining credit.",
  acknowledgeIntro: "I understand and acknowledge that:",
  acknowledgements: [
    {
      key: "a",
      text: "The Broker will use the personal information I provide to obtain the Access Seeker services from Equifax (a credit reporting body) on my behalf and if I do not provide the relevant information requested The Broker will not be able to obtain access to my credit reporting information from Equifax;",
    },
    {
      key: "b",
      text: "in obtaining access to my credit reporting information, The Broker will need to send my personal information to Equifax in order to obtain my credit reporting information as part of obtaining Access Seeker services on my behalf;",
    },
    {
      key: "c",
      text: "Equifax and its related companies may use and disclose such personal information to manage the provision of credit reporting information and the access seeker services, and to undertake data management for quality related purposes;",
    },
    {
      key: "d",
      text: "the Equifax privacy policy is available on the Equifax website at https://www.equifax.com.au/privacy, and contains information about how Equifax handles personal information (other than credit reporting information), including how an individual may access their personal information held by Equifax and its related companies and seek the correction of that information, and how an individual may complain about a breach of the Australian Privacy Principles and how Equifax and its related companies will deal with such a complaint; and",
    },
    {
      key: "e",
      text: "Equifax’s Credit Reporting Policy contains information about how Equifax collects and handles credit reporting information and is available on the Equifax website at https://www.equifax.com.au/credit-reporting-policy;",
    },
    {
      key: "f",
      text: "my personal information will otherwise be handled in accordance with the Combined Credit Guide and Privacy Statement provided to me by The Broker.",
    },
  ],
} as const;

/* ── Captured fields ─────────────────────────────────────────────────────── */

/** One "Signature / Date" block. The wet signature is added to the printed copy. */
export type CreditAuthSignatory = {
  /** Whether this applicant has (physically) signed — a print-and-tick flag. */
  signed: boolean;
  date: string;
};

/**
 * Everything the form captures. The bulk of the document is fixed legal text
 * (CREDIT_AUTHORISATION_TEXT); only these fields are filled in.
 */
export type CreditAuthorisationData = {
  /** The "I ___ (Name/s)" line — one or two applicants, free text. */
  names: string;
  /** The "of ___ (Address)" line. */
  address: string;
  /** The two Signature / Date blocks at the foot of the form. */
  signatories: [CreditAuthSignatory, CreditAuthSignatory];
  status: CreditAuthorisationStatus;
};

/** A persisted credit authorisation (table row). */
export type CreditAuthorisation = {
  id: string;
  names: string | null;
  status: string;
  contact_id: string | null;
  deal_id: string | null;
  data: CreditAuthorisationData;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/* ── Empty template ──────────────────────────────────────────────────────── */

function emptySignatory(): CreditAuthSignatory {
  return { signed: false, date: "" };
}

export function emptyCreditAuthorisation(): CreditAuthorisationData {
  return {
    names: "",
    address: "",
    signatories: [emptySignatory(), emptySignatory()],
    status: "draft",
  };
}

/**
 * Merge a persisted blob over the current template. A blob missing whole
 * sections (or predating a field) can't crash the form; the two signatory
 * blocks are always present and are merged per-index over the template so a
 * short or malformed array can't shrink the pair.
 */
export function hydrateCreditAuthorisation(raw: unknown): CreditAuthorisationData {
  const base = emptyCreditAuthorisation();
  if (!raw || typeof raw !== "object") return base;
  const d = raw as Partial<CreditAuthorisationData>;

  const storedSignatories = Array.isArray(d.signatories) ? d.signatories : [];
  const signatories = base.signatories.map((tpl, i) => {
    const got = storedSignatories[i];
    if (!got || typeof got !== "object") return tpl;
    return {
      signed: typeof got.signed === "boolean" ? got.signed : tpl.signed,
      date: typeof got.date === "string" ? got.date : tpl.date,
    };
  }) as [CreditAuthSignatory, CreditAuthSignatory];

  const status: CreditAuthorisationStatus =
    d.status === "signed" || d.status === "draft" ? d.status : base.status;

  return {
    names: typeof d.names === "string" ? d.names : base.names,
    address: typeof d.address === "string" ? d.address : base.address,
    signatories,
    status,
  };
}

/* ── Derived values ──────────────────────────────────────────────────────── */

/** The list-view label. Falls back to "" when no name has been entered. */
export function creditAuthorisationSummary(data: CreditAuthorisationData): string {
  return data.names.trim();
}

/* ── Supabase plumbing ───────────────────────────────────────────────────── */

/**
 * Human message from a Supabase PostgrestError, falling back to `errMessage`.
 * A PostgrestError is a plain object, not an `Error`, so `errMessage` alone
 * returns the fallback and discards what the database actually said. Read the
 * Postgrest fields first; hand everything else to the shared helper.
 */
export function creditAuthErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return errMessage(e, fallback);
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || errMessage(e, fallback);
}

/**
 * True when the failure is just "table not created yet" (migration not run).
 *
 * Deliberately narrow. A missing *column* reports as PGRST204 or 42703 — both of
 * which the obvious loose `schema cache` / `does not exist` substring test
 * swallows, telling the operator to run a migration they have already run. Match
 * the table-level codes, and only fall back to a substring test naming a *table*.
 */
export function creditAuthorisationsTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
