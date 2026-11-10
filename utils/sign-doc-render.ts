/**
 * SERVER-ONLY per-document plumbing for the e-signature flow — the one place
 * that maps a `doc_type` onto its Supabase table, its data hydrator, its
 * PDF/HTML renderer, its signer extraction, and its "mark signed" transition.
 *
 * The signing routes (preview / complete) stay thin: they never branch on
 * doc_type themselves, they call these helpers. Imports supabase + the PDF
 * renderers (react-dom/server via the wrappers), so it must never be pulled into
 * a client component — keep pure logic in utils/signatures.ts for that.
 */

import { supabase } from "./supabase";
import { log } from "./logger";
import {
  hydrateConsentDoc,
  consentDocSummary,
  consentProposedSigners,
} from "./introducer-consent";
import { renderReferralConsentHtml } from "./pdf/referralConsentPdf";
import {
  recordAudit,
  LOCKED_STATUS,
  type ComplianceDocType,
} from "./compliance-audit";
import type { SignatureMark } from "./signatures";

import { hydrateFactFind, applicantSummary as factFindSummary, type FactFindData } from "./factfind";
import {
  hydrateNeedsAnalysis,
  applicantSummary as needsAnalysisSummary,
  type NeedsAnalysisData,
} from "./needsAnalysis";
import {
  hydrateCreditAuthorisation,
  creditAuthorisationSummary,
  type CreditAuthorisationData,
} from "./creditAuthorisation";
import { hydrateEoi, eoiSummary, eoiProposedSigners, type EoiData } from "./eoi";

import { renderFactFindHtml } from "./pdf/factFindPdf";
import { needsAnalysisHtmlWithLogo } from "./pdf/needsAnalysisPdf";
import { renderCreditAuthorisationHtml } from "./pdf/creditAuthorisationPdf";
import { renderEoiHtml } from "./pdf/eoiPdf";
import {
  hydrateIntroducerAgreement,
  introducerAgreementSummary,
  introducerProposedSigners,
} from "./introducer-agreement";
import { renderIntroducerAgreementHtml } from "./pdf/introducerAgreementPdf";
import { hydratePa, paSummary, PRELIMINARY_ASSESSMENTS_TABLE } from "./preliminary-assessments";
import { renderPaPdf } from "./pa-signed-pdf";

/** A prospective signer prefilled from the document's applicant data. */
export type ProposedSigner = { name: string; email: string };

/** The table + the status column value each doc reaches when fully signed. */
const TABLE: Record<ComplianceDocType, string> = {
  fact_find: "borrower_fact_finds",
  needs_analysis: "nccp_needs_analyses",
  credit_authorisation: "credit_authorisations",
  // aml_case is never routed through the e-signature flow (loadDoc/markDocSigned
  // are only called for SIGN_DOC_TYPES). Present only to satisfy the exhaustive
  // Record — see utils/signatures.ts DOC_TYPE_LABEL.
  aml_case: "aml_cases",
  eoi: "eois",
  // All three introducer documents share ONE table. They carry the same fields,
  // are signed by the same person in the same sitting, and three near-identical
  // tables would be three places to forget to change something.
  introducer_nda: "introducer_agreement_docs",
  introducer_agreement: "introducer_agreement_docs",
  introducer_schedule: "introducer_agreement_docs",
  // The client's own consent form. One row per referral; see
  // migrations/20260821_referral_consent_esignature.sql.
  referral_consent: "introducer_consent_docs",
  // Rows are written by the mailbox feeder, not by a CRM form. See
  // migrations/20261006_preliminary_assessments.sql.
  preliminary_assessment: PRELIMINARY_ASSESSMENTS_TABLE,
};

/** What a fetched-and-hydrated document exposes to the signing routes. */
export type LoadedDoc = {
  /** A short human label for the document (applicant names) for emails/filenames. */
  summary: string;
  /** Render the document to standalone HTML, optionally with signatures baked in. */
  renderHtml: (signatures?: (SignatureMark | null)[]) => Promise<string>;
  /**
   * Produce the PDF directly, bypassing renderHtml + htmlToPdf. Set ONLY for a
   * document that already exists as a PDF somebody else issued (the Preliminary
   * Assessment): its signed copy is the original with signatures stamped on,
   * and there is no HTML to print. The signing routes use this when present;
   * every other doc type leaves it undefined and renders exactly as before.
   */
  renderPdf?: (signatures?: (SignatureMark | null)[]) => Promise<Uint8Array>;
  /** The signers proposed from the applicant data (name+email where known). */
  proposedSigners: () => ProposedSigner[];
};

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Fetch one document by id, hydrate its `data` blob, and return a LoadedDoc.
 * Returns null when the row is absent (or the table is missing). Explicit
 * columns — never `select("*")`; `data` holds PII but we need it to render.
 */
export async function loadDoc(
  docType: ComplianceDocType,
  docId: string,
): Promise<LoadedDoc | null> {
  const table = TABLE[docType];
  // The PA also needs to know where its PDF is. Asked for only on that table —
  // no other signable table has a `pdf_path` column, and naming a missing
  // column fails the whole select.
  const columns = docType === "preliminary_assessment" ? "id,data,pdf_path" : "id,data";
  const { data: row, error } = await supabase
    .from(table)
    .select(columns)
    .eq("id", docId)
    .maybeSingle();
  if (error) {
    log.warn("sign.load_doc_failed", { docType, docId, message: error.message });
    return null;
  }
  if (!row) return null;
  const blob = (row as unknown as { data: unknown }).data;

  if (docType === "preliminary_assessment") {
    const data = hydratePa(blob);
    const pdfPath = clean((row as unknown as { pdf_path?: unknown }).pdf_path);
    return {
      summary: paSummary(data),
      /* There is no HTML form of this document, and inventing one would mean an
       * applicant could be shown — or sign — our rendering of YLA's credit
       * proposal instead of the proposal. A caller that reaches this has missed
       * renderPdf, and should fail where it is noticed rather than produce a
       * plausible-looking wrong document. */
      renderHtml: async () => {
        throw new Error(
          "A Preliminary Assessment has no HTML rendering — it is YLA's own PDF. Use renderPdf().",
        );
      },
      renderPdf: (sigs) => renderPaPdf(pdfPath, data.signature_lines, sigs, data.applicants),
      proposedSigners: () => data.applicants.map((a) => ({ name: a.name, email: a.email })),
    };
  }

  if (docType === "fact_find") {
    const data: FactFindData = hydrateFactFind(blob);
    return {
      summary: factFindSummary(data),
      renderHtml: (sigs) => renderFactFindHtml(data, sigs),
      proposedSigners: () =>
        data.applicants.map((a) => ({
          name: [a.given_names, a.family_name].map(clean).filter(Boolean).join(" "),
          email: clean(a.email),
        })),
    };
  }
  if (docType === "needs_analysis") {
    const data: NeedsAnalysisData = hydrateNeedsAnalysis(blob);
    return {
      summary: needsAnalysisSummary(data),
      renderHtml: (sigs) => needsAnalysisHtmlWithLogo(data, sigs),
      proposedSigners: () =>
        data.applicants.map((a) => ({
          name: [a.given_names, a.surname].map(clean).filter(Boolean).join(" "),
          email: clean(a.contact?.email),
        })),
    };
  }
  if (docType === "eoi") {
    const data: EoiData = hydrateEoi(blob);
    return {
      summary: eoiSummary(data),
      renderHtml: (sigs) => renderEoiHtml(data, sigs),
      proposedSigners: () => eoiProposedSigners(data),
    };
  }
  if (docType === "referral_consent") {
    /* The consent wording is read from the BLOB, not from CONSENT_STATEMENT.
     * A client who signed the old wording consented to the old disclosure
     * chain, and re-rendering from today's constant would silently restate
     * what they agreed to. hydrateConsentDoc falls back to the constant only
     * for a row that carries no statement at all. */
    const data = hydrateConsentDoc(blob);
    return {
      summary: consentDocSummary(data),
      renderHtml: (sigs) => renderReferralConsentHtml(data, sigs),
      proposedSigners: () => consentProposedSigners(data),
    };
  }
  if (
    docType === "introducer_nda" ||
    docType === "introducer_agreement" ||
    docType === "introducer_schedule"
  ) {
    // The blob carries its own doc_type, so a row fetched from the shared table
    // renders as the document it actually is rather than the one the caller
    // asked for. They should agree; if they ever disagree, the stored content
    // is the truth.
    const data = hydrateIntroducerAgreement(blob);
    return {
      summary: introducerAgreementSummary(data),
      renderHtml: (sigs) => renderIntroducerAgreementHtml(data, sigs),
      proposedSigners: () => introducerProposedSigners(data),
    };
  }
  // credit_authorisation — one free-text names line, no per-applicant email.
  const data: CreditAuthorisationData = hydrateCreditAuthorisation(blob);
  return {
    summary: creditAuthorisationSummary(data),
    renderHtml: (sigs) => renderCreditAuthorisationHtml(data, sigs),
    proposedSigners: () => [{ name: clean(data.names), email: "" }],
  };
}

/**
 * Move the underlying document to its terminal (locked) status and record a
 * `sign` audit entry — called when the LAST signer completes. Best-effort on the
 * status write is not acceptable here (it's the lock), so failures are returned.
 */
export async function markDocSigned(
  docType: ComplianceDocType,
  docId: string,
  changedBy: string,
): Promise<{ ok: boolean; error?: string }> {
  const table = TABLE[docType];
  const terminal = LOCKED_STATUS[docType];

  // Fact Find / Needs Analysis keep status in the top-level column (their forms
  // and the server lock read it there). Credit Authorisation keeps status inside
  // the `data` blob (data.status) AND mirrors it to the column — its form derives
  // "locked" from data.status, so both must be set or the form won't lock.
  const patch: Record<string, unknown> = { status: terminal };
  if (docType === "credit_authorisation") {
    const { data: row } = await supabase.from(table).select("data").eq("id", docId).maybeSingle();
    const blob = hydrateCreditAuthorisation((row as { data: unknown } | null)?.data);
    blob.status = "signed";
    patch.data = blob;
  }

  const { error } = await supabase.from(table).update(patch).eq("id", docId);
  if (error) {
    log.error("sign.mark_doc_signed_failed", { docType, docId, message: error.message });
    return { ok: false, error: error.message };
  }
  await recordAudit({
    docType,
    docId,
    action: "sign",
    changedBy,
    statusAfter: terminal,
    note: "All signers completed the e-signature flow.",
  });
  return { ok: true };
}
