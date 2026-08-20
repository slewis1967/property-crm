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
 *
 * TWO PACKS COME THROUGH HERE.
 *
 * A `referral` (Tier 1) becomes `submitted` and waits for a super admin, exactly
 * as it always has.
 *
 * A `full` pack (Tier 2) does not wait. It becomes `accepted` in this same call,
 * and on the way it creates the NEXUS opportunity, promotes the fact find into a
 * real `borrower_fact_finds` row, creates CONTACTS for the applicants, derives
 * the NEEDS ANALYSIS from the fact find and sends it to the client to sign, and
 * emails each applicant their document-upload link. Sean's decision of 20 August
 * 2026; the reasoning, and what now stands in place of the accept gate, is in the
 * header of migrations/20260820_introducer_tier2_pack.sql.
 *
 * THE NEEDS ANALYSIS IS NOT OPTIONAL, AND IT IS NOT THE FACT FIND. utils/
 * yla-package.ts: "YLA do not receive a Fact Find — they receive a Needs
 * Analysis" (Sean, 2026-07-25; the Fact Find goes to brokers). It resolves that
 * document by `contact_id` and requires the terminal status WITH captured
 * signatures, so a pack that produced only a fact find, or only a draft, dead-
 * ended at the YLA submission after the client had already done all the work.
 * See migrations/20260820b_introducer_pack_needs_analysis.sql.
 *
 * THE THREE CHECKS ABOVE ARE THEREFORE LOAD-BEARING IN A WAY THEY WERE NOT
 * BEFORE. For a Tier 1 referral they protect a review queue. For a Tier 2 pack
 * they are the last thing standing before a live CRM record and an email to a
 * member of the public. A fourth joins them for the full pack: the fact find
 * must actually be finished, because nobody downstream gets a chance to send it
 * back.
 */
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { nexusApi } from "@/utils/nexus-api";
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
  canSendFullPack,
  factFindSubmitBlockers,
  packApplicantCount,
  packApplicantEmail,
  packApplicantName,
  normaliseAuPhone,
} from "../../../../../../utils/introducer";
import { applicantSummary, hydrateFactFind } from "../../../../../../utils/factfind";
import { factFindToNeedsAnalysis } from "../../../../../../utils/factFindToNeedsAnalysis";
import { applicantSummary as naApplicantSummary } from "../../../../../../utils/needsAnalysis";
import { syncFactFindContacts } from "../../../../../../utils/contact-sync";
import { createDocumentRequest } from "../../../../../../utils/document-requests-create";
import { createSignatureRequests } from "../../../../../../utils/signature-requests-create";
import { publicOrigin } from "../../../../../../utils/document-requests-db";
import { columnMissing } from "../../../../../../utils/column-missing";
import { isExpiredOn } from "../../../../../../utils/introducer-onboarding";
import { businessDayKey } from "../../../../../../utils/datetime";
import { sendNewPackNotice, sendNewReferralNotice } from "../../../../../../utils/introducer-email";
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

  /* -- Tier 2: the full submission pack -------------------------------------
   *
   * Everything above applied to both packs. From here the paths diverge, and
   * this one does not come back for a second approval - so the order below is
   * the order of "what would be worst to have created and then failed after".
   *
   *   fact find complete?  -> nothing created; refuse and say what is missing
   *   opportunity          -> if NEXUS is down, nothing has happened yet
   *   fact find row        -> orphaned only if the flip below fails, and it is
   *                           linked from the referral the moment it does
   *   flip to accepted     -> the pack is now real
   *   document requests    -> best-effort AFTER the flip, deliberately
   *
   * That last one is the interesting call. Emailing the client is the only step
   * that touches someone outside the business, and it is also the only one we
   * can safely retry - so it goes last and is allowed to fail without undoing a
   * submission the introducer has already been told succeeded. When it fails the
   * introducer is told plainly that their client was NOT emailed, and the
   * office's own notice says the same, because the resend is ours to do from the
   * CRM rather than theirs to retry at a client. The alternative - failing the
   * whole submit on a Brevo hiccup - would leave an opportunity and a fact find
   * behind anyway and tell the introducer none of it happened.
   */
  if (record.pack_type === "full") {
    // Tier is checked at create and enforced by a trigger, but a firm can be
    // demoted between starting a pack and submitting it. The submit is the act
    // that matters, so it is the tier at THIS moment that decides.
    if (!canSendFullPack(auth.tier)) {
      await logIntroducerEvent({
        clientId: record.id,
        introducerId: auth.introducerId,
        actorType: "introducer",
        actor: auth.email,
        action: "submit_refused_tier",
        detail: { tier: auth.tier },
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "Your firm is no longer accredited at Tier 2, so this pack can't be submitted. " +
            "Your work is saved — please contact Springboard.",
          code: "tier_required",
        },
        { status: 403 },
      );
    }

    const blockers = factFindSubmitBlockers(record.fact_find_data);
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `The fact find isn't finished yet. Still needed: ${blockers.join(", ")}.`,
          code: "fact_find_incomplete",
          blockers,
        },
        { status: 400 },
      );
    }

    const factFind = hydrateFactFind(record.fact_find_data);

    /* The opportunity first. If NEXUS is unreachable nothing else has happened
     * yet, and the pack stays a draft the introducer can submit again - the
     * same posture the super-admin accept path takes, and for the same reason:
     * a pack that says "submitted" with no opportunity behind it is worse than
     * one still sitting in the portal, because nobody goes looking for it. */
    let opportunityId: string | null = null;
    try {
      const res = await nexusApi("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: displayName(record as { first_name?: string; last_name?: string }),
          email,
          phone: normaliseAuPhone(String(record.phone ?? "")) ?? String(record.phone ?? ""),
          // Tagged at the source, and distinguishably from a Tier 1 referral:
          // these arrive already fact-found and are a different kind of lead.
          source: `introducer-pack:${auth.firmName}`,
          state: record.state ?? null,
        }),
      });
      const raw = await res.text();
      let opp: Record<string, unknown> = {};
      try {
        opp = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          {
            ok: false,
            error:
              "We couldn't reach the CRM, so nothing has been submitted yet. Your pack is saved — " +
              "please try again shortly.",
          },
          { status: 503 },
        );
      }
      if (!res.ok) {
        const e = typeof opp.error === "string" ? opp.error : "The CRM rejected the submission.";
        return NextResponse.json(
          { ok: false, error: `${e} Your pack is saved and has NOT been submitted.` },
          { status: 502 },
        );
      }
      const nested = opp.lead as Record<string, unknown> | undefined;
      opportunityId = String(opp.id ?? opp.lead_id ?? nested?.id ?? "") || null;
    } catch (e) {
      console.error("[introducer] tier 2 opportunity creation failed", e);
      return NextResponse.json(
        {
          ok: false,
          error:
            "We couldn't reach the CRM, so nothing has been submitted yet. Your pack is saved — " +
            "please try again shortly.",
        },
        { status: 503 },
      );
    }

    /* Promote the blob into a real fact find.
     *
     * "In review", not "Complete". The introducer has finished it; an assessor
     * has not read it. Marking it Complete here would make it read-only (see
     * utils/compliance-audit.ts) before anyone on our side had looked, and
     * "Complete" is a sign-off, not a delivery receipt. */
    const { data: ff, error: ffErr } = await supabase
      .from("borrower_fact_finds")
      .insert({
        applicant_name:
          applicantSummary(factFind) ||
          displayName(record as { first_name?: string; last_name?: string }),
        status: "In review",
        loan_amount: factFind.loan.amount_required,
        referred_by: auth.firmName,
        data: factFind,
        created_by: auth.email,
      })
      .select("id")
      .single();

    if (ffErr || !ff) {
      console.error("[introducer] tier 2 fact find insert failed", {
        client_id: record.id,
        opportunity_id: opportunityId,
        error: ffErr?.message,
      });
      // The opportunity exists. Say so, rather than implying a clean failure -
      // otherwise a retry creates a second one.
      return NextResponse.json(
        {
          ok: false,
          error:
            "The opportunity was created but the fact find could not be saved against it, so the " +
            "pack has NOT been submitted. Please contact Springboard rather than submitting again.",
        },
        { status: 500 },
      );
    }

    /* Contacts, like any other lead. Sean's call, 20 August 2026.
     *
     * Not cosmetic: everything downstream resolves compliance documents by
     * `contact_id` — yla-package.ts does `.eq("contact_id", …)` — so a pack
     * without one cannot be assembled for submission even once the Needs
     * Analysis exists. `syncFactFindContacts` also writes the id back onto the
     * fact find row, dedupes on email then name+DOB, and never throws: it is a
     * side effect of a submission that has already happened. */
    const contacts = await syncFactFindContacts(ff.id);
    const contactId = contacts.primaryContactId;
    if (!contactId) {
      console.error("[introducer] tier 2 contact sync produced no contact", {
        client_id: record.id,
        fact_find_id: ff.id,
      });
    }

    /* The Needs Analysis, derived rather than re-keyed.
     *
     * `factFindToNeedsAnalysis` is the same bridge the staff "seed a Needs
     * Analysis" button uses, so there is one mapping and not two that drift. It
     * returns review notes for every assumption it had to make (an ambiguous
     * asset type, an address it could not split); those go on the record so the
     * assessor sees them rather than inheriting silent guesses.
     *
     * Draft, not Complete. The client signs it — that is what moves it — and
     * marking it terminal here would both lock it before anyone reviewed it and
     * fake the very signature evidence yla-package.ts checks for. */
    const { data: naSeed, notes: naNotes } = factFindToNeedsAnalysis(factFind);
    const { data: na, error: naErr } = await supabase
      .from("nccp_needs_analyses")
      .insert({
        applicant_name:
          naApplicantSummary(naSeed) ||
          displayName(record as { first_name?: string; last_name?: string }),
        status: "Draft",
        contact_id: contactId,
        loan_amount: naSeed.loan_amount_sought,
        data: naSeed,
        created_by: auth.email,
      })
      .select("id")
      .single();

    if (naErr || !na) {
      console.error("[introducer] tier 2 needs analysis insert failed", {
        client_id: record.id,
        fact_find_id: ff.id,
        error: naErr?.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "The opportunity and fact find were created but the Needs Analysis could not be, so the " +
            "pack has NOT been submitted. Please contact Springboard rather than submitting again.",
        },
        { status: 500 },
      );
    }

    /* The flip, with the newest columns made optional.
     *
     * `needs_analysis_id` arrives with 20260820b and the house rule is that code
     * ships before the SQL is run. Without this, a deploy that lands before the
     * migration turns EVERY Tier 2 submit into the worst outcome available: the
     * opportunity, fact find, contacts and Needs Analysis are all created, then
     * the flip fails on the unknown column and the introducer is told the pack
     * was not submitted. Everything exists and nothing says so.
     *
     * Retrying is safe. A failed UPDATE changed nothing, and `.eq("status",
     * "draft")` still guards against a double-submit on the retry.
     *
     * The pack is worth more than the link, so we give up the link. */
    const flip: Record<string, unknown> = {
      status: "accepted",
      submitted_at: now,
      submitted_by: auth.userId,
      consent_confirmed_at: now,
      consent_statement: CONSENT_STATEMENT,
      stage: "documents",
      stage_updated_at: now,
      decided_at: now,
      // Not a person. A Tier 2 pack is accepted by rule, and the audit trail
      // should say which rule rather than name a super admin who was not there.
      decided_by: "system:tier2_pack",
      opportunity_id: opportunityId,
      fact_find_id: ff.id,
      needs_analysis_id: na.id,
      contact_id: contactId,
      updated_at: now,
    };

    const applyFlip = (patch: Record<string, unknown>) =>
      supabase
        .from("introducer_clients")
        .update(patch)
        .eq("id", record.id)
        .eq("introducer_id", auth.introducerId)
        .eq("status", "draft")          // no double-submit: a second call matches nothing
        .select("*")
        .single();

    let { data: accepted, error: accErr } = await applyFlip(flip);

    if (accErr && packWriteColumnMissing(accErr)) {
      console.error("[introducer] tier 2 flip retried without the newest columns", {
        client_id: record.id,
        error: accErr.message,
        hint: "run migrations/20260820b_introducer_pack_needs_analysis.sql",
      });
      const { needs_analysis_id: _na, contact_id: _c, ...withoutNewColumns } = flip;
      void _na;
      void _c;
      ({ data: accepted, error: accErr } = await applyFlip(withoutNewColumns));
    }

    if (accErr || !accepted) {
      console.error("[introducer] tier 2 accept flip failed", {
        client_id: record.id,
        opportunity_id: opportunityId,
        fact_find_id: ff.id,
        error: accErr?.message,
      });
      return NextResponse.json(
        {
          ok: false,
          error:
            "The opportunity and fact find were created but the pack could not be marked submitted. " +
            "Please contact Springboard rather than submitting again.",
        },
        { status: 500 },
      );
    }

    await logIntroducerEvent({
      clientId: record.id,
      introducerId: auth.introducerId,
      actorType: "introducer",
      actor: auth.email,
      action: "pack_submitted",
      detail: {
        client_ref: accepted.client_ref,
        opportunity_id: opportunityId,
        fact_find_id: ff.id,
        needs_analysis_id: na.id,
        contact_id: contactId,
        needs_analysis_notes: naNotes,
        consent_confirmed_at: now,
      },
    });
    // Recorded separately, in the same word the super-admin path uses, so "how
    // did this referral become accepted" has one action to search for.
    await logIntroducerEvent({
      clientId: record.id,
      introducerId: auth.introducerId,
      actorType: "system",
      actor: "system:tier2_pack",
      action: "accepted",
      detail: { via: "tier2_pack", introducer: auth.email, opportunity_id: opportunityId },
    });

    // Each applicant uploads their own ID, payslips and super statement, so each
    // gets their own link. A joint pack's two requests share an application_id
    // and applicant 1's reference, which is what puts them in one Drive folder.
    const docs = await requestDocumentsForPack({
      req,
      clientId: record.id,
      factFindData: record.fact_find_data,
      opportunityId,
      factFindId: ff.id,
      contactId,
      phone: String(record.phone ?? ""),
      createdBy: auth.email,
    });

    if (docs.requestId) {
      await supabase
        .from("introducer_clients")
        .update({ document_request_id: docs.requestId, updated_at: new Date().toISOString() })
        .eq("id", record.id);
    }

    await logIntroducerEvent({
      clientId: record.id,
      introducerId: auth.introducerId,
      actorType: "system",
      actor: "system:tier2_pack",
      action: docs.error ? "document_request_failed" : "document_request_sent",
      detail: { emailed: docs.emailed, error: docs.error ?? null },
    });

    /* Ask the client to sign the Needs Analysis.
     *
     * Best-effort and last, for the same reason as the document request: it is
     * outward-facing, it is retryable, and the submission has already happened.
     * If it fails the pack still exists and staff can resend from the CRM —
     * whereas failing the submit here would leave the opportunity, fact find,
     * contacts and Needs Analysis behind and tell the introducer nothing
     * happened. */
    const signature = await requestPackSignature({
      req,
      needsAnalysisId: na.id,
      factFindData: record.fact_find_data,
      createdBy: auth.email,
    });

    await logIntroducerEvent({
      clientId: record.id,
      introducerId: auth.introducerId,
      actorType: "system",
      actor: "system:tier2_pack",
      action: signature.error ? "needs_analysis_signature_failed" : "needs_analysis_sent_to_sign",
      detail: { needs_analysis_id: na.id, error: signature.error ?? null },
    });

    /* The office hears about a pack differently, and must. Nobody accepted
     * this one, so this email is the only thing that announces it — and it has
     * to say the opportunity already exists rather than pointing at a queue
     * item that will never appear. */
    const notify = officeRecipients();
    void sendNewPackNotice({
      to: notify,
      firmName: auth.firmName,
      introducerName: auth.fullName ?? auth.email,
      clientRef: String(accepted.client_ref ?? ""),
      clientName: displayName(accepted),
      clientId: record.id,
      opportunityId,
      factFindId: ff.id,
      documentsSent: docs.emailed,
    }).catch((e) => console.error("[introducer] pack notice failed", e));

    return NextResponse.json({
      ok: true,
      client: toPortalView(accepted),
      opportunity_id: opportunityId,
      fact_find_id: ff.id,
      needs_analysis_id: na.id,
      contact_id: contactId,
      documents_sent: docs.emailed,
      documents_error: docs.error,
      signature_sent: signature.error === null,
      signature_error: signature.error,
    });
  }

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

  notifyOffice(auth, data, record.id);

  return NextResponse.json({ ok: true, client: toPortalView(data) });
}

/**
 * The columns the flip is prepared to give up. Named rather than "any column
 * error", so a genuine schema mismatch elsewhere is not swallowed by a retry
 * that drops the wrong thing and was never going to help.
 */
const packWriteColumnMissing = (error: { code?: string; message?: string } | null) =>
  columnMissing(error, ["needs_analysis_id", "contact_id"]);

/** Who hears about a submission: the configured list, or the owner. */
function officeRecipients(): string[] {
  const notify = (process.env.INTRODUCER_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return notify.length > 0 ? notify : [...superAdminEmails()];
}

/**
 * Tell the office a REFERRAL arrived — the Tier 1 path only.
 *
 * Best-effort and deliberately not awaited: a mail failure must not undo a
 * submission the introducer has already been told succeeded. The review queue
 * is the system of record and this email is only a nudge toward it.
 *
 * A pack uses sendNewPackNotice instead. Its wording is not a variation on this
 * one - "awaiting review" and "nothing has been created in the CRM yet" are both
 * false for a pack, and an internal email that misdescribes what happened is
 * worse than none.
 */
function notifyOffice(
  auth: { firmName: string; fullName: string | null; email: string },
  row: Record<string, unknown>,
  clientId: string,
): void {
  void sendNewReferralNotice({
    to: officeRecipients(),
    firmName: auth.firmName,
    introducerName: auth.fullName ?? auth.email,
    clientRef: String(row.client_ref ?? ""),
    clientName: displayName(row as { first_name?: string; last_name?: string }),
    clientId,
  }).catch((e) => console.error("[introducer] new-referral notice failed", e));
}

type PackDocumentsResult = {
  /** Applicant 1's request, which the referral row points at. */
  requestId: string | null;
  /** True only if every applicant we had an address for was actually emailed. */
  emailed: boolean;
  error: string | null;
};

/**
 * Open the document-collection session(s) for a submitted pack.
 *
 * ONE REQUEST PER APPLICANT, because each person uploads their own photo ID,
 * payslips and super statement, and a shared link would file them all under one
 * name. The pair is tied together by `application_id` and by applicant 1's
 * client_ref, which is what lands them in a single Drive folder for YLA - the
 * same model RequestDocumentsButton uses on the staff side.
 *
 * Never throws. Every failure comes back as `error` for the caller to record and
 * the portal to offer a resend, because by the time this runs the pack is
 * already submitted and there is nothing useful to abort.
 */
async function requestDocumentsForPack(input: {
  req: Request;
  clientId: string;
  factFindData: unknown;
  opportunityId: string | null;
  factFindId: string;
  contactId: string | null;
  phone: string;
  createdBy: string;
}): Promise<PackDocumentsResult> {
  try {
    const origin = publicOrigin(input.req);
    const count = packApplicantCount(input.factFindData);

    /* The grouping id is minted UP FRONT and given to BOTH requests, not
     * derived from applicant 1's row afterwards. Setting it only on the second
     * request leaves applicant 1 with a NULL `application_id`, and the pair is
     * then two unrelated applications as far as every downstream query is
     * concerned — including the Drive export that is supposed to put them in
     * one folder. Same shape as RequestDocumentsButton on the staff side. */
    const applicationId = count === 2 ? randomUUID() : null;

    const first = await createDocumentRequest({
      applicantName: packApplicantName(input.factFindData, 0),
      applicantEmail: packApplicantEmail(input.factFindData, 0),
      applicantPhone: input.phone,
      origin,
      sendEmail: Boolean(packApplicantEmail(input.factFindData, 0)),
      opportunityId: input.opportunityId,
      factFindId: input.factFindId,
      contactId: input.contactId,
      introducerClientId: input.clientId,
      applicationId,
      createdBy: input.createdBy,
    });

    if (!first.ok) return { requestId: null, emailed: false, error: first.error };

    const requestId = String((first.request as { id?: string }).id ?? "") || null;
    let emailed = first.emailed;
    let error = first.emailError;

    if (count === 2) {
      const email2 = packApplicantEmail(input.factFindData, 1);
      const second = await createDocumentRequest({
        applicantName: packApplicantName(input.factFindData, 1),
        applicantEmail: email2,
        origin,
        sendEmail: Boolean(email2),
        opportunityId: input.opportunityId,
        factFindId: input.factFindId,
        contactId: input.contactId,
        introducerClientId: input.clientId,
        // Share applicant 1's reference and application so both sets of
        // documents arrive as one application, in one Drive folder.
        applicationId,
        clientRef: String((first.request as { client_ref?: string }).client_ref ?? "") || null,
        createdBy: input.createdBy,
      });
      if (!second.ok) {
        error = `Applicant 2's request failed: ${second.error}`;
        emailed = false;
      } else {
        emailed = emailed && second.emailed;
        error = error ?? second.emailError;
      }
    }

    return { requestId, emailed, error };
  } catch (e) {
    console.error("[introducer] pack document requests failed", e);
    return {
      requestId: null,
      emailed: false,
      error: e instanceof Error ? e.message : "document request failed",
    };
  }
}

/**
 * Send the pack's Needs Analysis to the client(s) for signature.
 *
 * WHY THIS EXISTS AT ALL. yla-package.ts assembles the submission from the
 * Needs Analysis and the Credit File Authorisation, and takes neither on trust:
 * it requires the terminal status AND captured signature marks, because a
 * package once went out with a `signed` status and two empty signature boxes.
 * So a Needs Analysis nobody has signed is not a step closer to a YLA
 * submission — it is the same dead end as not having one.
 *
 * Every applicant with a name signs, and each needs their own address. A joint
 * document signed by one of two people is refused by the packager, so a missing
 * second email is reported here rather than half-sending and looking done.
 *
 * Never throws — by the time this runs the pack is submitted and there is
 * nothing useful to abort.
 */
async function requestPackSignature(input: {
  req: Request;
  needsAnalysisId: string;
  factFindData: unknown;
  createdBy: string;
}): Promise<{ error: string | null }> {
  try {
    const count = packApplicantCount(input.factFindData);
    const signers: { name: string; email: string }[] = [];
    const missing: string[] = [];

    for (let i = 0; i < count; i++) {
      const idx = i as 0 | 1;
      const name = packApplicantName(input.factFindData, idx);
      const email = packApplicantEmail(input.factFindData, idx);
      if (email) signers.push({ name, email });
      else missing.push(name || `Applicant ${i + 1}`);
    }

    if (missing.length) {
      return {
        error:
          `No email address for ${missing.join(", ")}, so the Needs Analysis could not be sent for ` +
          `signature. Springboard will arrange it.`,
      };
    }

    const result = await createSignatureRequests({
      docType: "needs_analysis",
      docId: input.needsAnalysisId,
      signers,
      origin: publicOrigin(input.req),
      message:
        "This confirms the details your introducer recorded with you. Please review it and sign — " +
        "we can't progress your application until it's signed.",
      createdBy: input.createdBy,
    });

    return { error: result.ok ? null : result.error };
  } catch (e) {
    console.error("[introducer] pack signature request failed", e);
    return { error: e instanceof Error ? e.message : "signature request failed" };
  }
}
