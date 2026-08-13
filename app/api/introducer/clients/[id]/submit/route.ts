/**
 * POST /api/introducer/clients/<id>/submit   Body: { consent: true }
 *
 * PUBLIC (session-scoped). The one-way door: a draft becomes a submitted
 * referral, and from this moment the introducer cannot change it without a
 * super-admin unlock grant.
 *
 * Two things must be true before we accept it:
 *   1. Every required field is present. A half-filled referral wastes a review
 *      cycle and leaves us holding partial PII with no way to act on it.
 *   2. The introducer confirms they have the client's consent to pass their
 *      details to us. That confirmation is our lawful basis under APP 3/APP 5,
 *      so it is stored with the referral, along with the exact wording that was
 *      agreed to at the time.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireIntroducer, loadOwnClient, logIntroducerEvent, readJson } from "../../../_shared";
import {
  missingRequiredFields,
  fieldLabel,
  toPortalView,
  CONSENT_STATEMENT,
  looksLikeEmail,
  displayName,
} from "../../../../../../utils/introducer";
import { sendNewReferralNotice } from "../../../../../../utils/introducer-email";
import { superAdminEmails } from "../../../../../../utils/super-admin";

export const dynamic = "force-dynamic";

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
