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
import { findByToken, logOnboardingEvent } from "../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../utils/introducer-onboarding";
import { openNdaSigning } from "../../../../../../utils/introducer-nda";
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
    const opened = await openNdaSigning(app, now);
    if (!opened.ok) {
      if (opened.reason === "already_signed") {
        return NextResponse.json({ ok: false, alreadyDone: true, error: opened.error }, { status: 409 });
      }
      log.error("introducer_nda.not_ready", { applicationId: app.id, reason: opened.error });
      return NextResponse.json(
        { ok: false, error: "We can’t prepare your agreement yet. Springboard has been notified." },
        { status: 409 },
      );
    }

    await logOnboardingEvent(app.id, "applicant", app.email, "nda_signing_opened", {
      doc_id: opened.docId,
      issued: opened.issued,
    });

    return NextResponse.json({ ok: true, url: `/sign/${opened.raw}` });
  } catch (e) {
    if (onboardingTablesMissing(e)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    // openNdaSigning throws rather than translating this, so the degradation
    // has to happen here: an unapplied signature-requests migration is an
    // operator problem with a known fix, not an unexplained 500.
    if (signatureTableMissing(e)) {
      return NextResponse.json({ ok: false, error: SIGNATURE_MIGRATION_HINT }, { status: 501 });
    }
    log.error("introducer_nda.open_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
