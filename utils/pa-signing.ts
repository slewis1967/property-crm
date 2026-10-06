/**
 * SERVER-ONLY — sending a Preliminary Assessment to its applicants for
 * electronic signature.
 *
 * One function, because there is more than one way to trigger it (the rep's
 * button, and the call screen once the YLA video has been confirmed as watched)
 * and the rules below must hold whichever fires first:
 *
 *   1. ONCE. `signing_sent_at` is the claim, taken with a conditional update
 *      (`... where signing_sent_at is null`) and checked for a returned row.
 *      Read-then-write would let two callers both see "not sent" and both
 *      send. That is not just two emails: the completion route locks a document
 *      only when EVERY signature_requests row for it is signed (`allSigned`),
 *      so a second set of requests nobody signs leaves the PA unlockable.
 *
 *   2. EVERY APPLICANT OR NOBODY. A credit proposal signed by one of two
 *      borrowers is not half-signed, it is unusable. createSignatureRequests
 *      caps at MAX_SIGNERS by quietly slicing, which for a third applicant
 *      means "sent" with one person never asked. So more applicants than the
 *      engine can carry, or any applicant without a usable email, fails here
 *      with a message the rep can act on, before anything is sent.
 *
 *   3. A FAILED SEND RELEASES THE CLAIM and records why in `signing_error`,
 *      which the rep sees. A claim left behind by a failure would read as
 *      "sent" forever while the applicants wait for an email that never left.
 *
 * Signers see Springboard, never NextKey: the applicants are Springboard
 * clients and that is the only name they know.
 */

import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import {
  hydratePa,
  paSummary,
  PRELIMINARY_ASSESSMENTS_TABLE,
  type PaApplicant,
} from "./preliminary-assessments";
import {
  createSignatureRequests,
  signEmailHtml,
  DEFAULT_EXPIRY_DAYS,
  MAX_SIGNERS,
  type Signer,
} from "./signature-requests-create";
import { newToken } from "./sign-token";
import { sendBrevoEmail } from "./brevo";
import { resolveIdentity } from "./mailIdentities";
import { signBrand, signBrandStyle } from "./sign-brand";
import { recordAudit } from "./compliance-audit";
import { SIGNATURE_REQUESTS_TABLE, isUuid, isValidEmail } from "./signature-requests-db";
import { DOC_TYPE_LABEL } from "./signatures";

const DOC_TYPE = "preliminary_assessment" as const;

const PA_SIGN_MESSAGE =
  "Thank you for taking the time to go through your Preliminary Assessment with us. " +
  "Please review it and sign electronically when you are ready.";

export type SendPaForSigningResult =
  | { ok: true; sentTo: string[]; alreadySent: boolean }
  | { ok: false; error: string; status: number };

/**
 * Can this PA's applicants be sent it to sign? PURE.
 *
 * Returns the signers in applicant order — the order matters, because signer
 * index i is what later puts a signature on applicant i's printed line.
 */
export function validatePaSigners(
  applicants: PaApplicant[],
): { ok: true; signers: Signer[] } | { ok: false; error: string } {
  if (applicants.length === 0) {
    return {
      ok: false,
      error:
        "This Preliminary Assessment has no applicants recorded, so there is nobody to send it to.",
    };
  }
  if (applicants.length > MAX_SIGNERS) {
    return {
      ok: false,
      error:
        `This Preliminary Assessment has ${applicants.length} applicants, and a document can be sent to ` +
        `at most ${MAX_SIGNERS} signers. It was not sent to anyone: every applicant has to sign it.`,
    };
  }
  const missing = applicants.filter((a) => !isValidEmail(a.email));
  if (missing.length) {
    const who = missing.map((a) => a.name || "an unnamed applicant").join(" and ");
    return {
      ok: false,
      error:
        `No valid email address is recorded for ${who}. It was not sent to anyone: ` +
        `every applicant has to sign it.`,
    };
  }
  return { ok: true, signers: applicants.map((a) => ({ name: a.name, email: a.email.trim() })) };
}

/** "Preliminary Assessment (Marcia LIBMAN & Mark Benjamin LIBMAN)". PURE. */
export function paDocLabel(summary: string): string {
  const base = DOC_TYPE_LABEL[DOC_TYPE];
  return summary ? `${base} (${summary})` : base;
}

/** Narrow on purpose — table-level codes only, like factFindsTableMissing(). */
function paTableMissing(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "42P01" || code === "PGRST205";
}

const emailsOf = (applicants: PaApplicant[]): string[] =>
  applicants.map((a) => a.email).filter(Boolean);

/** Give the claim back and tell the rep why. Never throws. */
async function releaseClaim(paId: string, message: string): Promise<void> {
  const { error } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .update({ signing_sent_at: null, signing_error: message })
    .eq("id", paId);
  if (error) {
    // The PA now reads "sent" when it was not. Nothing more can be done from
    // here, so make sure it is findable.
    log.error("pa.signing_release_claim_failed", { paId, ...errInfo(error) });
  }
}

/**
 * Move the PA's status on once its requests are out. Only forward from the two
 * "not yet sent" states, and conditionally, so a PA that was signed or
 * superseded while the emails were going out isn't dragged back. Never throws:
 * the emails have gone and the claim stands, so only the label would be stale,
 * and failing the call over that would invite a second send.
 */
async function markSentForSigning(paId: string): Promise<void> {
  const { error } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .update({ status: "Sent for signing", signing_error: null })
    .eq("id", paId)
    .in("status", ["Received", "Presented"]);
  if (error) log.error("pa.signing_status_update_failed", { paId, ...errInfo(error) });
}

export async function sendPaForSigning(input: {
  paId: string;
  origin: string;
  createdBy: string;
}): Promise<SendPaForSigningResult> {
  const { paId, origin, createdBy } = input;
  if (!isUuid(paId)) {
    return { ok: false, error: "Invalid Preliminary Assessment id", status: 400 };
  }

  const { data: row, error: loadErr } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .select("id,status,data,signing_sent_at")
    .eq("id", paId)
    .maybeSingle();
  if (loadErr) {
    if (paTableMissing(loadErr)) {
      return {
        ok: false,
        error:
          "Preliminary Assessments aren't set up yet — run migrations/20261006_preliminary_assessments.sql.",
        status: 501,
      };
    }
    log.error("pa.signing_load_failed", { paId, ...errInfo(loadErr) });
    return { ok: false, error: "Could not load the Preliminary Assessment", status: 500 };
  }
  if (!row) return { ok: false, error: "Preliminary Assessment not found", status: 404 };

  const pa = row as { status: string; data: unknown; signing_sent_at: string | null };
  if (pa.status === "Signed") {
    return { ok: false, error: "This Preliminary Assessment has already been signed.", status: 409 };
  }
  if (pa.status === "Superseded") {
    return {
      ok: false,
      error:
        "This Preliminary Assessment has been replaced by a newer one from Your Loan Assist. Send that one instead.",
      status: 409,
    };
  }

  const data = hydratePa(pa.data);
  const recorded = emailsOf(data.applicants);
  if (pa.signing_sent_at) return { ok: true, sentTo: recorded, alreadySent: true };

  const valid = validatePaSigners(data.applicants);
  if (!valid.ok) {
    // Nothing was claimed, so there is nothing to release — but the rep still
    // needs to see why. Conditional, so it can't overwrite a send that landed
    // from another caller in the meantime.
    const { error: noteErr } = await supabase
      .from(PRELIMINARY_ASSESSMENTS_TABLE)
      .update({ signing_error: valid.error })
      .eq("id", paId)
      .is("signing_sent_at", null);
    if (noteErr) log.warn("pa.signing_error_note_failed", { paId, ...errInfo(noteErr) });
    return { ok: false, error: valid.error, status: 422 };
  }

  /* ── The claim ─────────────────────────────────────────────────────────── */
  const { data: claimed, error: claimErr } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .update({ signing_sent_at: new Date().toISOString(), signing_error: null })
    .eq("id", paId)
    .is("signing_sent_at", null)
    .in("status", ["Received", "Presented", "Sent for signing"])
    .select("id")
    .maybeSingle();
  if (claimErr) {
    log.error("pa.signing_claim_failed", { paId, ...errInfo(claimErr) });
    return { ok: false, error: "Could not start sending the Preliminary Assessment", status: 500 };
  }
  if (!claimed) {
    // Somebody else took the claim between our read and our write. Their send
    // is in flight; if it fails, they release the claim and signing_error says
    // so. From here the honest answer is "this is already being handled".
    return { ok: true, sentTo: recorded, alreadySent: true };
  }

  /* Requests that already exist for this PA — raised from somewhere other than
   * here, or left by a claim that was cleared by hand. Adding a second set would
   * break `allSigned` (see the header), so they ARE the send: keep the claim,
   * which is now simply true, and report who they went to. */
  const { data: existing, error: existingErr } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("signer_email")
    .eq("doc_type", DOC_TYPE)
    .eq("doc_id", paId);
  if (!existingErr && existing && existing.length > 0) {
    log.warn("pa.signing_requests_already_exist", { paId, count: existing.length });
    await markSentForSigning(paId);
    return {
      ok: true,
      sentTo: (existing as { signer_email: string }[]).map((r) => r.signer_email),
      alreadySent: true,
    };
  }
  // A failed lookup is not treated as "none exist". If the table is missing or
  // unreachable the create below fails on the same ground and says so properly.

  let result: Awaited<ReturnType<typeof createSignatureRequests>>;
  try {
    result = await createSignatureRequests({
      docType: DOC_TYPE,
      docId: paId,
      signers: valid.signers,
      origin,
      createdBy,
      brand: "springboard",
      docLabel: paDocLabel(paSummary(data)),
      message: PA_SIGN_MESSAGE,
      deliver: "email",
    });
  } catch (e) {
    log.error("pa.signing_send_threw", { paId, ...errInfo(e) });
    result = { ok: false, error: "Could not send for signature", status: 500 };
  }

  if (!result.ok) {
    await releaseClaim(paId, result.error);
    return { ok: false, error: result.error, status: result.status };
  }

  await markSentForSigning(paId);
  return { ok: true, sentTo: valid.signers.map((s) => s.email), alreadySent: false };
}


export type ResendPaSigningResult =
  | { ok: true; sentTo: string[] }
  | { ok: false; error: string; status: number };

/** Which signer rows a resend goes to: everyone who has not signed yet. */
export function outstandingSigners<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((r) => r.status !== "signed");
}

/**
 * Send fresh signing links to the applicants who have not signed yet.
 *
 * For when a link has expired, was lost, or a signer declined and has changed
 * their mind. Someone who has already signed is left alone and keeps their
 * signature.
 *
 * EACH SIGNER KEEPS THEIR ONE ROW, ROTATED IN PLACE. The completion route locks
 * the document only when every signature_requests row for it is signed, so
 * inserting a second row per signer would leave the first unsigned forever and
 * the PA could never lock (the introducer NDA shipped with exactly that bug).
 * Rotating token_hash also kills the old link, which is what you want when the
 * reason for resending is that the old email went astray.
 *
 * The row is rotated BEFORE the email is sent. If the send then fails the old
 * link is already dead, but the rep is told and pressing Resend again recovers;
 * the other order could leave two live links for one signature.
 */
export async function resendPaSigning(input: {
  paId: string;
  origin: string;
  createdBy: string;
}): Promise<ResendPaSigningResult> {
  const { paId, origin, createdBy } = input;
  if (!isUuid(paId)) {
    return { ok: false, error: "Invalid Preliminary Assessment id", status: 400 };
  }

  const { data: row, error: loadErr } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .select("id,status,data")
    .eq("id", paId)
    .maybeSingle();
  if (loadErr) {
    log.error("pa.resend_load_failed", { paId, ...errInfo(loadErr) });
    return { ok: false, error: "Could not load the Preliminary Assessment", status: 500 };
  }
  if (!row) return { ok: false, error: "Preliminary Assessment not found", status: 404 };
  const pa = row as { status: string; data: unknown };
  if (pa.status !== "Sent for signing") {
    return {
      ok: false,
      error:
        pa.status === "Signed"
          ? "This Preliminary Assessment has already been signed by everyone."
          : "This Preliminary Assessment has not been sent for signing yet, so there is nothing to resend.",
      status: 409,
    };
  }

  const { data: reqs, error: reqErr } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("id,signer_name,signer_email,status,brand")
    .eq("doc_type", DOC_TYPE)
    .eq("doc_id", paId)
    .order("signer_index", { ascending: true });
  if (reqErr) {
    log.error("pa.resend_requests_failed", { paId, ...errInfo(reqErr) });
    return { ok: false, error: "Could not load the signing requests", status: 500 };
  }
  const outstanding = outstandingSigners(
    (reqs ?? []) as {
      id: string;
      signer_name: string | null;
      signer_email: string;
      status: string;
      brand: string | null;
    }[],
  );
  if (outstanding.length === 0) {
    return { ok: false, error: "Everyone has already signed. Nothing to resend.", status: 409 };
  }

  const docLabel = paDocLabel(paSummary(hydratePa(pa.data)));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const sentTo: string[] = [];
  const failures: string[] = [];

  for (const r of outstanding) {
    const { raw, hash } = newToken();
    const { data: rotated, error: rotErr } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .update({
        token_hash: hash,
        status: "sent",
        sent_at: now.toISOString(),
        expires_at: expiresAt,
        viewed_at: null,
        decline_reason: null,
      })
      .eq("id", r.id)
      // Never reopen a row that was signed between the read and this write.
      .neq("status", "signed")
      .select("id")
      .maybeSingle();
    if (rotErr) {
      log.error("pa.resend_rotate_failed", { paId, requestId: r.id, ...errInfo(rotErr) });
      failures.push(`${r.signer_email}: could not issue a new link`);
      continue;
    }
    if (!rotated) continue; // signed in the meantime — nothing to send

    const style = signBrandStyle(r.brand);
    const sender = resolveIdentity(style.identity);
    const sent = await sendBrevoEmail({
      to: [{ email: r.signer_email, name: r.signer_name || undefined }],
      subject: `Please sign your ${docLabel}`,
      html: signEmailHtml(
        r.signer_name ?? "",
        docLabel,
        `${origin}/sign/${raw}`,
        "Here is a fresh link to sign your Preliminary Assessment. Any earlier link no longer works.",
        signBrand(r.brand),
      ),
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      tags: ["e-signature", "resend"],
    });
    if (!sent.ok) {
      failures.push(`${r.signer_email}: ${sent.error}`);
      continue;
    }
    sentTo.push(r.signer_email);
    await recordAudit({
      docType: DOC_TYPE,
      docId: paId,
      action: "update",
      changedBy: createdBy,
      note: `Signing link resent to ${r.signer_email}`,
    });
  }

  const error = failures.length ? `Could not resend: ${failures.join("; ")}` : null;
  const { error: noteErr } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .update({
      signing_error: error,
      ...(sentTo.length ? { signing_sent_at: now.toISOString() } : {}),
    })
    .eq("id", paId);
  if (noteErr) log.warn("pa.resend_note_failed", { paId, ...errInfo(noteErr) });

  if (error) return { ok: false, error, status: 502 };
  return { ok: true, sentTo };
}
