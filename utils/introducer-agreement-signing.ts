/**
 * The last step: the referral agreement and the commission schedule.
 *
 * WHY THIS EXISTS. `agreement_sent` moved the application on and emailed the
 * candidate a link to their roadmap — and that was all it did. No document was
 * created, no signature was requested, and the roadmap rendered nothing beneath
 * "Sign the introducer agreement". Two accredited introducers (SBI-2026-0004
 * and -0005) sat on that step being told to sign something that did not exist.
 * The engine could already render and execute both documents; nothing ever
 * asked it to.
 *
 * TWO DOCUMENTS, ONE AT A TIME. The agreement and the schedule are separate
 * instruments and are signed separately — the schedule is the one that says
 * whether money changes hands, and it is issued by invitation on the paid
 * variant. Handing someone two links at once means one of them goes stale in an
 * inbox; so the signer is always offered THE NEXT UNSIGNED ONE, and comes back
 * for the second after the first is executed. The application advances only
 * when both are in.
 */

import { supabase } from "./supabase";
import type { IntroducerDocType } from "./introducer-agreement";
import { INTRODUCER_DOC_LABEL } from "./introducer-agreement";
import { logOnboardingEvent, type Application } from "./introducer-onboarding-db";
import {
  applicationIdForDoc,
  openIntroducerDocSigning,
  signedDocTypes,
} from "./introducer-doc-signing";

/**
 * Signing order. The agreement first: it is the instrument that creates the
 * relationship, and the schedule is an annexure to it. Signing the fee terms
 * before agreeing to the arrangement they hang off would be backwards.
 */
export const AGREEMENT_SEQUENCE: readonly IntroducerDocType[] = [
  "introducer_agreement",
  "introducer_schedule",
] as const;

export type AgreementProgress = {
  signed: IntroducerDocType[];
  outstanding: IntroducerDocType[];
  complete: boolean;
};

/** Where this application has got to across the two documents. */
export async function agreementProgress(applicationId: string): Promise<AgreementProgress> {
  const signed = await signedDocTypes(applicationId);
  const done = AGREEMENT_SEQUENCE.filter((t) => signed.has(t));
  const outstanding = AGREEMENT_SEQUENCE.filter((t) => !signed.has(t));
  return { signed: done, outstanding, complete: outstanding.length === 0 };
}

export type OpenAgreementResult =
  | {
      ok: true;
      docId: string;
      docType: IntroducerDocType;
      label: string;
      raw: string;
      issued: boolean;
      /** How many documents are still unsigned INCLUDING this one. */
      remaining: number;
    }
  | { ok: false; reason: "not_ready" | "complete"; error: string };

/**
 * Open the next document in the set for signing.
 *
 * Skips anything already executed, so a signer returning after the agreement is
 * handed the schedule rather than the agreement again. When both are in it
 * reports `complete` rather than an error — a person who signed on another
 * device and came back has done nothing wrong.
 */
export async function openAgreementSigning(
  app: Application,
  now: Date,
): Promise<OpenAgreementResult> {
  const progress = await agreementProgress(app.id);
  if (progress.complete) {
    return {
      ok: false,
      reason: "complete",
      error: "Both documents have been signed.",
    };
  }

  const docType = progress.outstanding[0];
  const opened = await openIntroducerDocSigning(app, docType, now);

  if (!opened.ok) {
    if (opened.reason === "already_signed") {
      // signedDocTypes and the request row disagreed — possible only in the
      // window between the two reads. Reconcile by trying again rather than
      // telling a signer something is wrong when nothing is.
      const again = await agreementProgress(app.id);
      if (again.complete) {
        await advanceApplicationOnAgreementSigned(opened.docId ?? "", app.email);
        return { ok: false, reason: "complete", error: "Both documents have been signed." };
      }
      const next = again.outstanding[0];
      const retry = await openIntroducerDocSigning(app, next, now);
      if (retry.ok) {
        return {
          ok: true,
          docId: retry.docId,
          docType: next,
          label: INTRODUCER_DOC_LABEL[next],
          raw: retry.raw,
          issued: retry.issued,
          remaining: again.outstanding.length,
        };
      }
      return { ok: false, reason: "not_ready", error: retry.error };
    }
    return { ok: false, reason: "not_ready", error: opened.error };
  }

  return {
    ok: true,
    docId: opened.docId,
    docType,
    label: INTRODUCER_DOC_LABEL[docType],
    raw: opened.raw,
    issued: opened.issued,
    remaining: progress.outstanding.length,
  };
}

/**
 * Move the application on once BOTH documents are in.
 *
 * Called from the signing-completion route, which knows only the document id.
 * Signing the agreement alone advances nothing — that is the point of checking
 * the whole set rather than reacting to the document in hand.
 *
 * Conditional on the row still being `certificate_issued` or `agreement_sent`,
 * and deliberately so. The state machine is forward-only: if staff already
 * recorded execution out-of-band, or the introducer has since been activated,
 * this must not drag them backwards and re-open a finished step. A no-op is the
 * correct outcome there, not an error.
 *
 * Activation stays a separate, deliberate action. Creating a login is the
 * moment a third party gets inside something of ours, and that should be
 * somebody pressing a button.
 */
export async function advanceApplicationOnAgreementSigned(
  docId: string,
  signerEmail: string,
): Promise<{ advanced: boolean; complete: boolean }> {
  const applicationId = await applicationIdForDoc(docId);
  if (!applicationId) return { advanced: false, complete: false };

  const progress = await agreementProgress(applicationId);
  if (!progress.complete) return { advanced: false, complete: false };

  const { data, error } = await supabase
    .from("introducer_applications")
    .update({ state: "agreement_signed", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .in("state", ["certificate_issued", "agreement_sent"])
    .select("id");
  if (error) throw error;

  const advanced = Array.isArray(data) && data.length > 0;
  if (advanced) {
    await logOnboardingEvent(applicationId, "applicant", signerEmail, "agreement_signed", {
      doc_id: docId,
      method: "e-signature",
      documents: AGREEMENT_SEQUENCE,
    });
  }
  return { advanced, complete: true };
}
