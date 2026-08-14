/**
 * POST /api/introducer/onboarding/{token}/nda
 *
 * Applicant-initiated: "I'm ready to sign the confidentiality agreement."
 * Issues the NDA if it doesn't exist yet, mints a signing link, and returns it
 * so the page can send them straight there.
 *
 * WHY THE APPLICANT MAY MINT THEIR OWN SIGNING TOKEN. Everywhere else in the
 * CRM a signature request is created by a staff member and emailed out. Here
 * the caller is already holding the onboarding token, which is the credential
 * that proves who they are — the same one that lets them upload photo ID two
 * steps later. Making them wait for an email to be sent to the address they are
 * already authenticated against would add a round trip and a support call
 * without adding an ounce of assurance.
 *
 * PUBLIC ROUTE. `/api/introducer/*` is on the Cloudflare Access bypass and
 * isPublicIntroducerRoute in proxy.ts, so there is no CF Access identity here.
 * The onboarding token is the only credential, which is why nothing is done
 * before it resolves and why the failure responses say as little as possible.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { findByToken, logOnboardingEvent } from "../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../utils/introducer-onboarding";
import { ensureNdaDoc, advanceApplicationOnNdaSigned } from "../../../../../../utils/introducer-nda";
import { newToken } from "../../../../../../utils/sign-token";
import {
  SIGNATURE_REQUESTS_TABLE,
  SIGNATURE_MIGRATION_HINT,
  signatureTableMissing,
} from "../../../../../../utils/signature-requests-db";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { log, errInfo } from "../../../../../../utils/logger";

export const dynamic = "force-dynamic";

/** Long enough to read a confidentiality agreement properly, short enough that
 *  an abandoned link does not stay live for a month. */
const EXPIRY_DAYS = 14;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // A signing link is a credential. Cheap to mint, so cap the rate at which one
  // caller can spray them.
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 10 });
  if (limited) return limited;

  const { token } = await params;

  try {
    const result = await findByToken(decodeURIComponent(token));
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.reason === "expired"
              ? "This link has expired. Ask Springboard to send you a fresh one."
              : "We can’t open this link.",
        },
        { status: 404 },
      );
    }

    const app = result.application;

    // Forward-only, and the message has to be useful rather than a bare 409:
    // someone who signed on another device and came back needs to be told they
    // are already through this step, not that something failed.
    if (app.state !== "invited") {
      return NextResponse.json(
        {
          ok: false,
          alreadyDone: app.state !== "withdrawn",
          error:
            app.state === "withdrawn"
              ? "This application has been stopped."
              : "You’ve already signed the confidentiality agreement — refresh to see your next step.",
        },
        { status: 409 },
      );
    }

    const now = new Date();
    const doc = await ensureNdaDoc(app, now);
    if (!doc.ok) {
      log.error("introducer_nda.not_ready", { applicationId: app.id, reason: doc.error });
      return NextResponse.json(
        { ok: false, error: "We can’t prepare your agreement yet. Springboard has been notified." },
        { status: 409 },
      );
    }

    const { raw, hash } = newToken();
    const expiresAt = new Date(now.getTime() + EXPIRY_DAYS * 86_400_000).toISOString();

    // EXACTLY ONE REQUEST ROW PER SIGNER, ROTATED IN PLACE — this is load-bearing,
    // not tidiness.
    //
    // The completion route decides a document is fully executed with
    // allSigned(rows), which selects EVERY signature_requests row for the
    // doc and requires all of them to be status 'signed'. The obvious
    // implementation here — insert a fresh request each visit and mark the old
    // one 'expired' — leaves a non-signed row behind forever, so allSigned can
    // never be true, markDocSigned never runs, and the document stays Draft
    // while the signer is told it worked. That is exactly what happened on the
    // first run of this code.
    //
    // Rotating the token on the single row keeps that invariant: the superseded
    // link dies because its hash is overwritten, and there is nothing left to
    // block completion.
    const { data: existingReq, error: findReqErr } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .select("id,status")
      .eq("doc_type", "introducer_nda")
      .eq("doc_id", doc.id)
      .eq("signer_index", 1)
      .maybeSingle();
    if (findReqErr) {
      if (signatureTableMissing(findReqErr)) {
        return NextResponse.json({ ok: false, error: SIGNATURE_MIGRATION_HINT }, { status: 501 });
      }
      throw findReqErr;
    }

    if (existingReq?.status === "signed") {
      // The document is executed but the application never advanced — the
      // best-effort hook in the signing route must have failed. Put that right
      // rather than handing out a link to sign something already signed.
      await advanceApplicationOnNdaSigned(doc.id, app.email);
      return NextResponse.json(
        { ok: false, alreadyDone: true, error: "You’ve already signed the confidentiality agreement." },
        { status: 409 },
      );
    }

    const shared = {
      signer_name: app.legal_name,
      signer_email: app.email,
      token_hash: hash,
      status: "sent" as const,
      sent_at: now.toISOString(),
      expires_at: expiresAt,
      // Clear anything a previous attempt left behind, so a rotated link starts
      // from a clean slate rather than inheriting a decline.
      viewed_at: null,
      signed_at: null,
      signature_image: null,
      signer_ip: null,
      signer_user_agent: null,
      consent_at: null,
      signed_pdf_path: null,
      decline_reason: null,
    };

    const { error: writeErr } = existingReq?.id
      ? await supabase.from(SIGNATURE_REQUESTS_TABLE).update(shared).eq("id", existingReq.id)
      : await supabase.from(SIGNATURE_REQUESTS_TABLE).insert({
          doc_type: "introducer_nda",
          doc_id: doc.id,
          signer_index: 1,
          // The applicant asked for this themselves; say so rather than
          // attributing it to whichever staff member started the application.
          created_by: `applicant:${app.email}`,
          ...shared,
        });
    if (writeErr) {
      if (signatureTableMissing(writeErr)) {
        return NextResponse.json({ ok: false, error: SIGNATURE_MIGRATION_HINT }, { status: 501 });
      }
      throw writeErr;
    }

    await logOnboardingEvent(app.id, "applicant", app.email, "nda_signing_opened", {
      doc_id: doc.id,
      issued: doc.created,
    });

    return NextResponse.json({ ok: true, url: `/sign/${raw}` });
  } catch (e) {
    if (onboardingTablesMissing(e)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    log.error("introducer_nda.open_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
