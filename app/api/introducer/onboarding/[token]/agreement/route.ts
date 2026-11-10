/**
 * POST /api/introducer/onboarding/{token}/agreement
 *
 * Applicant-initiated: "I'm ready to sign the introducer agreement." Issues the
 * next of the two documents if it doesn't exist yet, mints a signing link, and
 * returns it so the page can send them straight there.
 *
 * THE STEP THIS FIXES WAS A DEAD END. `agreement_sent` rendered a roadmap entry
 * with nothing beneath it — the same failure the NDA step had before SignNda
 * was written, and it stranded two accredited introducers who had been emailed
 * "last step: your introducer agreement" and given no way to take it.
 *
 * WHY THE APPLICANT MAY MINT THEIR OWN SIGNING TOKEN. The caller is already
 * holding the onboarding token, which is the credential that proves who they
 * are — the same one that let them upload photo ID. Making them wait for an
 * email to the address they are already authenticated against would add a round
 * trip and a support call without adding an ounce of assurance.
 *
 * PUBLIC ROUTE. `/api/introducer/*` is on the Cloudflare Access bypass and
 * isPublicIntroducerRoute in proxy.ts, so there is no CF Access identity here.
 * The onboarding token is the only credential, which is why nothing is done
 * before it resolves and why the failure responses say as little as possible.
 */
import { NextResponse } from "next/server";
import { findByToken, logOnboardingEvent } from "../../../../../../utils/introducer-onboarding-db";
import { canSignAgreement, onboardingTablesMissing } from "../../../../../../utils/introducer-onboarding";
import { openAgreementSigning } from "../../../../../../utils/introducer-agreement-signing";
import { signatureTableMissing, SIGNATURE_MIGRATION_HINT } from "../../../../../../utils/signature-requests-db";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { log, errInfo } from "../../../../../../utils/logger";

export const dynamic = "force-dynamic";

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
    if (!canSignAgreement(app.state)) {
      return NextResponse.json(
        {
          ok: false,
          alreadyDone: app.state === "agreement_signed" || app.state === "activated",
          error:
            app.state === "withdrawn"
              ? "This application has been stopped."
              : app.state === "agreement_signed" || app.state === "activated"
                ? "You’ve already signed — refresh to see where you are."
                : "Your agreement isn’t ready yet. We’ll email you the moment it is.",
        },
        { status: 409 },
      );
    }

    const opened = await openAgreementSigning(app, new Date());
    if (!opened.ok) {
      if (opened.reason === "complete") {
        return NextResponse.json({ ok: false, alreadyDone: true, error: opened.error }, { status: 409 });
      }
      // `not_ready` here is OUR problem, not theirs — a missing accreditation
      // number, or a paid arrangement whose fee nobody has set. They cannot fix
      // any of it, so they are told plainly that we have been told.
      log.error("introducer_agreement.not_ready", { applicationId: app.id, reason: opened.error });
      return NextResponse.json(
        { ok: false, error: "We can’t prepare your agreement yet. Springboard has been notified." },
        { status: 409 },
      );
    }

    await logOnboardingEvent(app.id, "applicant", app.email, "agreement_signing_opened", {
      doc_id: opened.docId,
      doc_type: opened.docType,
      issued: opened.issued,
      remaining: opened.remaining,
    });

    return NextResponse.json({
      ok: true,
      url: `/sign/${opened.raw}`,
      label: opened.label,
      remaining: opened.remaining,
    });
  } catch (e) {
    if (onboardingTablesMissing(e)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    // openAgreementSigning throws rather than translating this, so the
    // degradation has to happen here: an unapplied signature-requests migration
    // is an operator problem with a known fix, not an unexplained 500.
    if (signatureTableMissing(e)) {
      return NextResponse.json({ ok: false, error: SIGNATURE_MIGRATION_HINT }, { status: 501 });
    }
    log.error("introducer_agreement.open_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
