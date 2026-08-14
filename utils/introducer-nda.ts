/**
 * Issuing the introducer NDA, and what happens when it comes back signed.
 *
 * WHY THIS EXISTS. The e-signature engine already knows how to render, send and
 * mark an `introducer_nda` — it is in SIGN_DOC_TYPES, it has a table, a hydrator
 * and a PDF renderer. What was missing was anything that ever *created* the
 * document, so `introducer_agreement_docs` sat empty and step one of the
 * onboarding roadmap ("Sign the confidentiality agreement") had nothing behind
 * it. An applicant reaching that step was told to do something with no means to
 * do it. This module is the missing half.
 *
 * The NDA is the one introducer document that can be issued before anything is
 * known about the signer beyond the name staff stated at invite: it is signed
 * *before* identity is verified and before the exam, which is exactly why
 * readyToIssue() exempts it from the accreditation-number requirement.
 */

import { supabase } from "./supabase";
import {
  emptyIntroducerAgreement,
  readyToIssue,
  type IntroducerAgreementData,
} from "./introducer-agreement";
import { logOnboardingEvent, type Application } from "./introducer-onboarding-db";

export const INTRODUCER_DOCS_TABLE = "introducer_agreement_docs";

/**
 * Build the NDA document body from the application.
 *
 * Pure, so the mapping is testable without a database. Everything is
 * snapshotted rather than referenced: a document has to render years later as
 * it read when it was signed, even if the firm renames itself in between.
 *
 * `issuedAt` is passed in rather than read from the clock so a caller can stamp
 * a whole issue with one timestamp, and so tests are deterministic.
 */
export function ndaDataFor(app: Application, issuedAt: string): IntroducerAgreementData {
  const d = emptyIntroducerAgreement("introducer_nda", app.agreement_variant ?? "standard");
  d.legal_name = (app.legal_name ?? "").trim();
  d.email = (app.email ?? "").trim();
  d.firm_name = (app.firm_name ?? "").trim();
  d.abn = (app.abn ?? "").trim();
  // Deliberately left blank: the NDA is signed before the exam, so there is no
  // accreditation number yet and readyToIssue() does not ask for one.
  d.accreditation_no = "";
  d.issued_at = issuedAt;
  d.subtitle = app.tier === "t2" ? "Tier 2 accreditation" : "Tier 1 accreditation";
  return d;
}

type EnsureResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

/**
 * Get this application's NDA document, creating it on first use.
 *
 * Idempotent by design. The applicant can land on the sign step more than once
 * — a closed tab, a second device, a link opened twice — and each visit must
 * reach the *same* document rather than minting a fresh one. Two NDA rows for
 * one application would mean two things to sign and no answer to "which one did
 * they agree to".
 */
export async function ensureNdaDoc(app: Application, now: Date): Promise<EnsureResult> {
  const { data: existing, error: findErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("id")
    .eq("application_id", app.id)
    .eq("doc_type", "introducer_nda")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) return { ok: true, id: existing.id as string, created: false };

  const data = ndaDataFor(app, now.toISOString());
  const ready = readyToIssue(data);
  if (!ready.ok) return { ok: false, error: ready.reason };

  const { data: inserted, error: insErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .insert({
      application_id: app.id,
      doc_type: "introducer_nda",
      status: "Draft",
      data,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return { ok: true, id: (inserted as { id: string }).id, created: true };
}

/**
 * The application a signed introducer document belongs to.
 *
 * Used by the signing-completion hook, which knows the document id and nothing
 * else about onboarding.
 */
export async function applicationIdForDoc(docId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("application_id")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  return (data as { application_id: string } | null)?.application_id ?? null;
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
