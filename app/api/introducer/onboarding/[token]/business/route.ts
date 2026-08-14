/**
 * POST /api/introducer/onboarding/{token}/business
 *
 * The applicant's own business details — the entity the referral agreement is
 * executed with. Until this existed there was nowhere to put them: `firm_name`
 * and `abn` were staff-entered at invite and routinely blank, and there was no
 * ACN field at all, so the agreement would have rendered with holes in the
 * party clause.
 *
 * PUBLIC ROUTE. `/api/introducer/*` is on the Cloudflare Access bypass, so the
 * onboarding token is the only credential and nothing happens before it
 * resolves.
 *
 * These are applicant-writable, which is not a hole in the module's "identity
 * is issued, never typed" rule — that rule is about who they ARE, so that
 * nobody accredits themselves under a name of their choosing. Their company's
 * ABN is a different kind of fact: they know it, we don't, and it is checkable
 * against a public register.
 */
import { NextResponse } from "next/server";
import { findByToken, saveBusinessDetails, logOnboardingEvent } from "../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing, isFinished } from "../../../../../../utils/introducer-onboarding";
import { validateBusinessDetails } from "../../../../../../utils/introducer-entity";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { log, errInfo } from "../../../../../../utils/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20 });
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

    // Editable right up until the agreement goes out, then fixed. The agreement
    // snapshots these details, and a record that quietly disagrees with the
    // document executed against it is worse than one merely out of date.
    if (isFinished(app.state) || app.state === "agreement_sent" || app.state === "agreement_signed") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Your agreement has already been prepared with these details. Contact Springboard if they need to change.",
        },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const parsed = validateBusinessDetails(body ?? {});
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, field: parsed.field, error: parsed.error }, { status: 400 });
    }

    const saved = await saveBusinessDetails(app.id, parsed.value);
    if (!saved.ok) {
      log.error("introducer_business.save_blocked", { applicationId: app.id, reason: saved.error });
      return NextResponse.json(
        { ok: false, error: "We can’t save these just yet. Springboard has been notified." },
        { status: 503 },
      );
    }

    await logOnboardingEvent(app.id, "applicant", app.email, "business_details_saved", {
      entity_type: parsed.value.entity_type,
      // The values themselves are on the application row; the event records
      // that they were stated and when, not a second copy to drift from it.
      has_acn: parsed.value.acn !== "",
    });

    return NextResponse.json({ ok: true, details: parsed.value });
  } catch (e) {
    if (onboardingTablesMissing(e)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    log.error("introducer_business.save_failed", { ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
