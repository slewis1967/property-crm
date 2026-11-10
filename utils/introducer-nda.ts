/**
 * Issuing the introducer NDA, and what happens when it comes back signed.
 *
 * WHAT IS LEFT HERE. Creating the document and minting its signing link is the
 * same job for all three introducer documents, and now lives in
 * ./introducer-doc-signing — the comment on its rotate-in-place block explains
 * why there must only ever be one copy of it. What stays here is what is true
 * of the NDA and of nothing else: that it is the one document issuable before
 * anything is known about the signer beyond the name staff stated at invite,
 * signed BEFORE identity is verified and before the exam, which is why
 * readyToIssue() exempts it from the accreditation-number requirement — and
 * that signing it is what opens step two.
 */

import { supabase } from "./supabase";
import { type IntroducerAgreementData } from "./introducer-agreement";
import { logOnboardingEvent, type Application } from "./introducer-onboarding-db";
import {
  ensureIntroducerDoc,
  introducerDocDataFor,
  openIntroducerDocSigning,
  applicationIdForDoc,
  INTRODUCER_DOCS_TABLE,
  SIGNING_LINK_DAYS,
  type EnsureResult,
} from "./introducer-doc-signing";

export { INTRODUCER_DOCS_TABLE, SIGNING_LINK_DAYS, applicationIdForDoc };

/**
 * Build the NDA document body from the application.
 *
 * Pure, so the mapping is testable without a database. Kept as its own name
 * because the NDA's exemption — no accreditation number — is a fact worth being
 * able to point at, and because the tests that pin it were written against this.
 */
export function ndaDataFor(app: Application, issuedAt: string): IntroducerAgreementData {
  return introducerDocDataFor(app, "introducer_nda", issuedAt);
}

/** Get this application's NDA, creating it on first use. Idempotent. */
export async function ensureNdaDoc(app: Application, now: Date): Promise<EnsureResult> {
  return ensureIntroducerDoc(app, "introducer_nda", now);
}

/**
 * Issue the NDA if needed and hand back a live signing link.
 *
 * ONE IMPLEMENTATION, TWO CALLERS — the applicant opening it from the portal,
 * and staff sending it for signature from /admin/introducers.
 *
 * Returns the raw token. That is the only moment it exists in plaintext; the
 * database stores its hash and nothing else.
 */
export async function openNdaSigning(
  app: Application,
  now: Date,
): Promise<
  | { ok: true; docId: string; raw: string; issued: boolean }
  | { ok: false; reason: "not_ready" | "already_signed"; error: string }
> {
  const opened = await openIntroducerDocSigning(app, "introducer_nda", now);
  if (opened.ok) return opened;

  if (opened.reason === "already_signed") {
    // Executed, but the application never advanced — the best-effort hook in
    // the signing route must have failed. Put that right rather than hand out a
    // link to sign something already signed.
    if (opened.docId) await advanceApplicationOnNdaSigned(opened.docId, app.email);
    return {
      ok: false,
      reason: "already_signed",
      error: "The confidentiality agreement has already been signed.",
    };
  }
  return { ok: false, reason: "not_ready", error: opened.error };
}

/**
 * Move the application on once its NDA comes back signed.
 *
 * Called from the signing-completion route, which knows only the document id.
 *
 * Conditional on the row still being `invited`, and deliberately so. The state
 * machine is forward-only: if staff already recorded the NDA out-of-band, or
 * the applicant is somehow further along, this must not drag them backwards to
 * `nda_signed` and re-open a step they have finished. A no-op is the correct
 * outcome there, not an error.
 */
export async function advanceApplicationOnNdaSigned(
  docId: string,
  signerEmail: string,
): Promise<{ advanced: boolean }> {
  const applicationId = await applicationIdForDoc(docId);
  if (!applicationId) return { advanced: false };

  const { data, error } = await supabase
    .from("introducer_applications")
    .update({ state: "nda_signed", updated_at: new Date().toISOString() })
    .eq("id", applicationId)
    .eq("state", "invited")
    .select("id");
  if (error) throw error;

  const advanced = Array.isArray(data) && data.length > 0;
  if (advanced) {
    await logOnboardingEvent(applicationId, "applicant", signerEmail, "nda_signed", {
      doc_id: docId,
      method: "e-signature",
    });
  }
  return { advanced };
}
