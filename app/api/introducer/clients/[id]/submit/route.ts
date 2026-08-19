/**
 * POST /api/introducer/clients/<id>/submit   Body: { consent: true }
 *
 * PUBLIC (session-scoped). The one-way door: a draft becomes a submitted
 * referral, and from this moment the introducer cannot change it without a
 * super-admin unlock grant.
 *
 * Three things must be true before we accept it:
 *   1. The introducer's accreditation has not expired. The referral agreement
 *      says no fee is payable for a referral made while it was expired, and a
 *      referral we cannot pay for is one we should not have taken.
 *   2. Every required field is present. A half-filled referral wastes a review
 *      cycle and leaves us holding partial PII with no way to act on it.
 *   3. The introducer confirms they have the client's consent to pass their
 *      details to us, AND the signed consent form is attached. That confirmation
 *      is our lawful basis under APP 3/APP 5, so it is stored with the referral
 *      along with the exact wording that was agreed to at the time — and the
 *      form behind it is the evidence. A tick is an assertion; a signed form is
 *      the thing that answers a challenge two years later.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireIntroducer, loadOwnClient, logIntroducerEvent, readJson } from "../../../_shared";
import {
  missingRequiredFields,
  fieldLabel,
  toPortalView,
  CONSENT_STATEMENT,
  CONSENT_FORM_LABEL,
  looksLikeEmail,
  displayName,
} from "../../../../../../utils/introducer";
import { isExpiredOn } from "../../../../../../utils/introducer-onboarding";
import { businessDayKey } from "../../../../../../utils/datetime";
import { sendNewReferralNotice } from "../../../../../../utils/introducer-email";
import { superAdminEmails } from "../../../../../../utils/super-admin";

export const dynamic = "force-dynamic";

/** "2027-08-14" → "14 August 2027". A calendar day, printed as one. */
function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  if (record.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "This referral has already been submitted." },
      { status: 409 },
    );
  }

  /* Accreditation first, before anything the introducer could have to redo. A
   * referral is only worth submitting if it can be acted on, and telling
   * someone their accreditation lapsed AFTER making them fix three fields is a
   * poor way to find out.
   *
   * The DRAFT is untouched. Their work is not the thing that expired.
   *
   * An unrecorded expiry (NULL) is not an expired one — every firm activated
   * before these dates existed has none, and reading that as expired would shut
   * the portal for all of them on the day this deployed. */
  const today = businessDayKey(new Date().toISOString())!;
  if (isExpiredOn(auth.accreditationExpiresAt, today)) {
    // Recorded, because someone trying to refer with a lapsed accreditation is
    // something the office should be able to see afterwards — and because the
    // refusal itself is evidence that the rule was enforced rather than merely
    // written down.
    await logIntroducerEvent({
      clientId: record.id,
      introducerId: auth.introducerId,
      actorType: "introducer",
      actor: auth.email,
      action: "submit_refused_accreditation_expired",
      detail: { expired_on: auth.accreditationExpiresAt },
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          `Your Springboard accreditation expired on ${formatDay(auth.accreditationExpiresAt!)}. ` +
          `Referrals can't be submitted until it is renewed — please contact Springboard. Your ` +
          `draft is saved and nothing has been lost.`,
        code: "accreditation_expired",
        expired_on: auth.accreditationExpiresAt,
      },
      { status: 403 },
    );
  }

  if (body.consent !== true) {
    return NextResponse.json(
      { ok: false, error: "Please confirm you have the client's consent before submitting.", code: "consent_required" },
      { status: 400 },
    );
  }

  const missing = missingRequiredFields(record);
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Please complete: ${missing.map(fieldLabel).join(", ")}.`,
        missing_required: missing,
      },
      { status: 400 },
    );
  }

  const email = String(record.email ?? "");
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "That email address doesn't look right." }, { status: 400 });
  }

  /* The signed form itself, not just the tick above it.
   *
   * The referral agreement makes the signed Referral Consent and Privacy Form a
   * precondition of a fee being payable, and the manual tells introducers it
   * must be uploaded. Until now nothing checked, which made both statements
   * aspirational.
   *
   * A REJECTED form does not count. A replaced one does not either — the
   * replacement is the row that counts, and it is present under the same label.
   * Anything else on the referral is irrelevant here: it must be THIS label. */
  const { data: consentDocs, error: consentErr } = await supabase
    .from("introducer_documents")
    .select("id,status")
    .eq("client_id", record.id)
    .eq("label", CONSENT_FORM_LABEL)
    .in("status", ["uploaded", "accepted"])
    .limit(1);

  if (consentErr) {
    return NextResponse.json(
      { ok: false, error: "Could not check the consent form. Please try again." },
      { status: 500 },
    );
  }

  if (!consentDocs || consentDocs.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Please attach the signed Referral Consent and Privacy Form before submitting. " +
          "The client's signature on that form is what lets us pass their details on.",
        code: "consent_form_required",
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("introducer_clients")
    .update({
      status: "submitted",
      submitted_at: now,
      submitted_by: auth.userId,
      consent_confirmed_at: now,
      consent_statement: CONSENT_STATEMENT,
      stage: "received",
      stage_updated_at: now,
      updated_at: now,
    })
    .eq("id", record.id)
    .eq("introducer_id", auth.introducerId)
    .eq("status", "draft")            // no double-submit: a second call matches nothing
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Could not submit. Please try again." }, { status: 500 });
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "submitted",
    detail: { client_ref: data.client_ref, consent_confirmed_at: now },
  });

  // Tell the office. Best-effort: a mail failure must not undo a submission the
  // introducer has already been told succeeded — the review queue is the system
  // of record, and this email is only a nudge toward it.
  const notify = (process.env.INTRODUCER_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const recipients = notify.length > 0 ? notify : [...superAdminEmails()];
  void sendNewReferralNotice({
    to: recipients,
    firmName: auth.firmName,
    introducerName: auth.fullName ?? auth.email,
    clientRef: String(data.client_ref ?? ""),
    clientName: displayName(data),
    clientId: record.id,
  }).catch((e) => console.error("[introducer] new-referral notice failed", e));

  return NextResponse.json({ ok: true, client: toPortalView(data) });
}
