/**
 * The Referral Consent and Privacy Form the CLIENT signs.
 *
 * WHAT THIS DOCUMENT IS FOR. migrations/20260811_introducer_portal.sql calls the
 * client's consent "the lawful basis for us holding the record at all" (Privacy
 * Act APP 3 / APP 5). Until now the evidence behind that was a scan the
 * introducer uploaded — a photographed page that cannot say who signed it, when,
 * or from where. This is the same form as a document the client signs
 * electronically, so the evidence is a captured mark with an email, a timestamp
 * and an IP address behind it.
 *
 * THE WORDING IS SNAPSHOTTED, NOT REFERENCED. `consent_statement` is copied into
 * the blob when the form is issued and rendered from the blob thereafter.
 * CONSENT_STATEMENT names the whole disclosure chain — Springboard Homes, G.B.
 * Mayes Holdings, Your Loan Assist under its credit licence, a licensed adviser,
 * lenders — and if that chain ever changes, someone who signed the old wording
 * consented to the old chain. A document that re-rendered from today's constant
 * would silently restate what they had agreed to, which is the one thing a
 * consent record must never do.
 *
 * Pure — no Supabase, no Next. The I/O lives in the route.
 */

import { CONSENT_STATEMENT, type ClientRecordShape } from "./introducer";

/** One person consenting on their own behalf. */
export type ConsentSigner = {
  name: string;
  email: string;
};

export type ConsentDocData = {
  /** The referral this belongs to, for the printed reference line. */
  client_ref: string;
  /** The introducer firm making the referral — named ON the form the client signs. */
  firm_name: string;
  /**
   * Everyone consenting. One per applicant on the referral: consent covers each
   * person's OWN personal information, so a second applicant consents for
   * themselves rather than being covered by the first.
   */
  signers: ConsentSigner[];
  /** The client's details as they stood when the form was issued. */
  client: {
    suburb: string;
    state: string;
    postcode: string;
    dob: string;
  };
  /** CONSENT_STATEMENT verbatim, as at the moment of issue. Never re-derived. */
  consent_statement: string;
  /** ISO. When the form was generated. */
  issued_at: string;
};

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Build the document from a referral.
 *
 * Applicant 2 is included only when they have a name — an empty second slot is
 * not a person who needs to consent, and issuing them a signature request would
 * mean the form could never reach "signed by everyone asked".
 */
export function buildConsentDoc(
  record: ClientRecordShape,
  opts: { firmName: string; issuedAt: string },
): ConsentDocData {
  const signers: ConsentSigner[] = [];

  const first = [clean(record.first_name), clean(record.last_name)].filter(Boolean).join(" ");
  if (first) signers.push({ name: first, email: clean(record.email) });

  const second = [clean(record.applicant2_first_name), clean(record.applicant2_last_name)]
    .filter(Boolean)
    .join(" ");
  if (second) signers.push({ name: second, email: clean(record.applicant2_email) });

  return {
    client_ref: clean(record.client_ref),
    firm_name: opts.firmName,
    signers,
    client: {
      suburb: clean(record.suburb),
      state: clean(record.state),
      postcode: clean(record.postcode),
      dob: clean(record.dob),
    },
    consent_statement: CONSENT_STATEMENT,
    issued_at: opts.issuedAt,
  };
}

/** Merge a persisted blob over the template so an older row opens cleanly. */
export function hydrateConsentDoc(raw: unknown): ConsentDocData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Partial<ConsentDocData>;
  return {
    client_ref: clean(d.client_ref),
    firm_name: clean(d.firm_name),
    signers: Array.isArray(d.signers)
      ? d.signers.map((s) => ({ name: clean(s?.name), email: clean(s?.email) }))
      : [],
    client: {
      suburb: clean(d.client?.suburb),
      state: clean(d.client?.state),
      postcode: clean(d.client?.postcode),
      dob: clean(d.client?.dob),
    },
    /* Falls back to today's wording ONLY when the blob carries none — a row
     * written before this field existed. A stored statement always wins. */
    consent_statement: clean(d.consent_statement) || CONSENT_STATEMENT,
    issued_at: clean(d.issued_at),
  };
}

/** "Ada Lovelace & Charles Babbage" — for emails and filenames. */
export function consentDocSummary(d: ConsentDocData): string {
  const names = d.signers.map((s) => s.name).filter(Boolean);
  return names.length ? names.join(" & ") : d.client_ref || "Referral consent";
}

/** Who the signature engine should ask. */
export function consentProposedSigners(d: ConsentDocData): { name: string; email: string }[] {
  return d.signers.map((s) => ({ name: s.name, email: s.email }));
}

/**
 * Is this document sendable?
 *
 * Every signer needs an address, because the engine refuses a document that is
 * not signed by everyone asked — issuing one with a blank address creates a
 * document that can never complete, which is worse than refusing to issue it.
 */
export function consentReadyToSend(d: ConsentDocData): { ok: true } | { ok: false; reason: string } {
  if (d.signers.length === 0) {
    return { ok: false, reason: "The referral has no client name on it yet." };
  }
  const missing = d.signers.filter((s) => !s.email).map((s) => s.name || "an applicant");
  if (missing.length) {
    return {
      ok: false,
      reason: `No email address for ${missing.join(" and ")}. Add one, or upload a signed paper form instead.`,
    };
  }
  return { ok: true };
}
