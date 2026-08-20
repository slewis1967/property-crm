/**
 * The three signable introducer documents — data model.
 *
 * Pure: no database, no rendering. Imported by both the server plumbing and the
 * PDF renderer, so it must stay free of either.
 *
 * WHY THE CONTENT IS SNAPSHOTTED. `data` holds the document as it read when it
 * was issued, not a set of foreign keys to be re-joined at render time. An
 * agreement has to render years later exactly as it was signed, even if the fee
 * schedule, the applicant's trading name or our own address has changed since. A
 * signed document that quietly re-renders from live data is not evidence of
 * anything, and would be worse than useless in the dispute it exists for.
 */

export const INTRODUCER_DOC_TYPES = [
  "introducer_nda",
  "introducer_agreement",
  "introducer_schedule",
] as const;

export type IntroducerDocType = (typeof INTRODUCER_DOC_TYPES)[number];

export const INTRODUCER_DOC_LABEL: Record<IntroducerDocType, string> = {
  introducer_nda: "Mutual Confidentiality Agreement",
  introducer_agreement: "Introducer Referral Agreement",
  introducer_schedule: "Commission Schedule",
};

/** "Signed" — matching the vocabulary the engine already uses for the EOI. */
export const INTRODUCER_DOC_TERMINAL_STATUS = "Signed";

/**
 * Which commercial terms this introducer is on.
 *
 *   standard — Document 2. Springboard pays no referral fee.
 *   paid     — Documents 2A + 2B. A Referral Fee per settled referral, offered
 *              by invitation only.
 *
 * This is not cosmetic: the two documents say opposite things about whether
 * money changes hands, and issuing the wrong one to someone would be issuing an
 * agreement that contradicts what they were actually offered.
 */
export const AGREEMENT_VARIANTS = ["standard", "paid"] as const;
export type AgreementVariant = (typeof AGREEMENT_VARIANTS)[number];

export const VARIANT_LABEL: Record<AgreementVariant, string> = {
  standard: "Standard — no referral fee",
  paid: "Paid — referral fee per settled referral",
};

export type IntroducerAgreementData = {
  /** Which of the three this is. Stored in the blob as well as the column so a
   *  renderer handed only `data` still knows what it is looking at. */
  doc_type: IntroducerDocType;

  /** Which commercial terms. Snapshotted like everything else, so a document
   *  signed under the standard terms still reads as standard after the person
   *  is later moved onto the paid arrangement. */
  variant: AgreementVariant;

  /** The applicant, exactly as stated when the application was started. */
  legal_name: string;
  email: string;
  firm_name: string;
  abn: string;
  /** Applicant-supplied. Blank for a sole trader, which has no ACN. */
  acn: string;
  /** Where formal notices go. Blank on documents issued before this was captured. */
  registered_address: string;

  /** Issued at accreditation. Blank on the NDA, which is signed before the exam. */
  accreditation_no: string;

  /** The contracting party on our side. Held here, not hardcoded in the
   *  renderer, because it is a fact about this agreement rather than about the
   *  software — and the licensing chain is still being settled. */
  licensor_name: string;
  licensor_abn: string;
  licence_ref: string;

  /** Commission terms. Blank until the fee amounts are settled; the schedule
   *  refuses to issue while they are (see readyToIssue). */
  fee_per_settlement: string;
  fee_notes: string;

  /** This introducer is paid on settled referrals submitted by introducers they
   *  recruited, as well as on their own — the BDM arrangement. Snapshotted like
   *  everything else: a schedule signed without the network entitlement must go
   *  on reading that way after the person is later given one. */
  recruits_introducers: boolean;

  /** Stamped at issue so the rendered document carries its own date. */
  issued_at: string;
  /** Free text shown under the title, e.g. "Tier 1 accreditation". */
  subtitle: string;
};

export function emptyIntroducerAgreement(
  docType: IntroducerDocType,
  variant: AgreementVariant = "standard",
): IntroducerAgreementData {
  return {
    doc_type: docType,
    variant,
    legal_name: "",
    email: "",
    firm_name: "",
    abn: "",
    acn: "",
    registered_address: "",
    accreditation_no: "",
    licensor_name: "G.B. Mayes Holdings Pty Ltd",
    licensor_abn: "49 634 656 947",
    licence_ref: "COMP-8317",
    fee_per_settlement: "",
    fee_notes: "",
    recruits_introducers: false,
    issued_at: "",
    subtitle: "",
  };
}

/** Tolerant hydration — an older blob must never crash a render. */
export function hydrateIntroducerAgreement(blob: unknown): IntroducerAgreementData {
  const raw = (blob ?? {}) as Partial<IntroducerAgreementData>;
  const docType = INTRODUCER_DOC_TYPES.includes(raw.doc_type as IntroducerDocType)
    ? (raw.doc_type as IntroducerDocType)
    : "introducer_agreement";
  // An unrecognised variant resolves to standard — the terms under which
  // Springboard pays nothing. A bad value must never invent a fee obligation.
  const variant: AgreementVariant = raw.variant === "paid" ? "paid" : "standard";
  const base = emptyIntroducerAgreement(docType, variant);
  const str = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v : fallback);

  return {
    doc_type: docType,
    variant,
    legal_name: str(raw.legal_name, base.legal_name),
    email: str(raw.email, base.email),
    firm_name: str(raw.firm_name, base.firm_name),
    abn: str(raw.abn, base.abn),
    // Absent from documents issued before business details were captured, and
    // that is correct: a snapshot must keep reading as it did when it was
    // signed, not acquire facts we learned afterwards.
    acn: str(raw.acn, base.acn),
    registered_address: str(raw.registered_address, base.registered_address),
    accreditation_no: str(raw.accreditation_no, base.accreditation_no),
    licensor_name: str(raw.licensor_name, base.licensor_name),
    licensor_abn: str(raw.licensor_abn, base.licensor_abn),
    licence_ref: str(raw.licence_ref, base.licence_ref),
    fee_per_settlement: str(raw.fee_per_settlement, base.fee_per_settlement),
    fee_notes: str(raw.fee_notes, base.fee_notes),
    // Anything but an explicit true is false. A document that predates the BDM
    // arrangement must not acquire a network entitlement by being re-read.
    recruits_introducers: raw.recruits_introducers === true,
    issued_at: str(raw.issued_at, base.issued_at),
    subtitle: str(raw.subtitle, base.subtitle),
  };
}

/** Short label for emails and filenames. */
export function introducerAgreementSummary(d: IntroducerAgreementData): string {
  const who = d.firm_name || d.legal_name || "Introducer";
  return `${INTRODUCER_DOC_LABEL[d.doc_type]} — ${who}`;
}

/** There is exactly one signer, and we know who they are. */
export function introducerProposedSigners(d: IntroducerAgreementData) {
  return [{ name: d.legal_name, email: d.email }];
}

/**
 * Refuse to issue a document that would be signed with blanks in it.
 *
 * The fee rule depends on the variant, and getting that backwards in either
 * direction is a real error rather than a cosmetic one:
 *
 *   paid     — a commission schedule with no fee is a contract about nothing.
 *   standard — there IS no referral fee, so demanding one would make the
 *              standard schedule impossible to issue at all. An amount appearing
 *              on a standard schedule is worse still: it would promise money the
 *              agreement it belongs to explicitly says is not payable.
 */
export function readyToIssue(d: IntroducerAgreementData): { ok: true } | { ok: false; reason: string } {
  if (!d.legal_name.trim()) return { ok: false, reason: "the applicant's legal name is missing" };
  if (!d.email.trim()) return { ok: false, reason: "the applicant's email is missing" };

  if (d.doc_type === "introducer_schedule") {
    if (d.variant === "paid" && !d.fee_per_settlement.trim()) {
      return {
        ok: false,
        reason:
          "this is a paid arrangement but the referral fee has not been set. A commission schedule with a blank fee is a contract about nothing — set the amount before issuing it",
      };
    }
    if (d.variant === "standard" && d.fee_per_settlement.trim()) {
      return {
        ok: false,
        reason:
          "a referral fee has been entered on a STANDARD schedule, which promises money the standard agreement says is not payable. Either clear the fee or move them onto the paid arrangement",
      };
    }
  }
  if (d.recruits_introducers && d.variant !== "paid") {
    return {
      ok: false,
      reason:
        "this introducer is marked as earning on referrals from introducers they recruit, but they are on the STANDARD arrangement, under which Springboard pays nothing at all. Move them onto the paid arrangement or clear the network entitlement",
    };
  }
  if (d.doc_type !== "introducer_nda" && !d.accreditation_no.trim()) {
    return {
      ok: false,
      reason: "there is no accreditation number yet — issue the certificate first, since the agreement cites it",
    };
  }
  return { ok: true };
}
