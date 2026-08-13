import { NextResponse } from "next/server";
import { requireStaff, requireSuperAdmin, readJson } from "../_shared";
import {
  createApplication,
  listApplications,
  logOnboardingEvent,
} from "../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../utils/introducer-onboarding";
import { sendOnboardingInviteEmail } from "../../../../../utils/introducer-onboarding-email";
import { supabase } from "../../../../../utils/supabase";

/**
 * Starting an introducer's accreditation.
 *
 * This is the panel Sean asked for: a name, an email, Send. Everything after it
 * is self-service, and the applicant walks the runway at their own pace.
 *
 * IT DOES NOT GRANT PORTAL ACCESS. That distinction is the whole point of this
 * route existing separately from POST /api/admin/introducers, which creates the
 * firm and its login in one action. That route is now the LAST step of the
 * pipeline rather than the first; this one is the beginning.
 */

const looksLikeEmail = (s: string) => /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s);

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  try {
    return NextResponse.json({ ok: true, applications: await listApplications() });
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      // The migration has not been applied yet. Say so plainly rather than
      // 500-ing — a colleague seeing this needs to know it is a deployment
      // step, not a bug in the page.
      return NextResponse.json({ ok: true, applications: [], migration_pending: true });
    }
    throw err;
  }
}

export async function POST(req: Request) {
  // Onboarding an introducer is a super-admin action, exactly as adding a firm
  // is — starting an accreditation commits us to a relationship.
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const legalName = typeof body.legal_name === "string" ? body.legal_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!legalName) {
    return NextResponse.json(
      { ok: false, error: "Their full legal name is required — it is what the certificate prints and the agreement is signed in." },
      { status: 400 },
    );
  }
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "A valid email address is required." }, { status: 400 });
  }

  // Two prior claims on this email, checked before we write anything so the
  // answer is useful rather than a unique-index violation.
  const { data: existingUser } = await supabase
    .from("introducer_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existingUser) {
    return NextResponse.json(
      { ok: false, error: "That email already has an introducer login — they are already onboarded." },
      { status: 409 },
    );
  }

  let created;
  try {
    created = await createApplication({
      legalName,
      email,
      firmName: typeof body.firm_name === "string" ? body.firm_name : null,
      abn: typeof body.abn === "string" ? body.abn : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      // Tier 2 collects a fact find and an NCCP needs analysis. It is offerable
      // as of 13 August 2026, when the credit-licensing advice cleared it;
      // anything unrecognised falls back to Tier 1 rather than erroring, so a
      // bad value can never accidentally widen someone's authority.
      tier: body.tier === "t2" ? "t2" : "t1",
      // The paid arrangement is invitation-only and pays a referral fee, so it
      // has to be chosen deliberately. Anything unrecognised falls back to the
      // standard terms — a bad value must never create a fee obligation.
      variant: body.agreement_variant === "paid" ? "paid" : "standard",
      createdBy: auth,
    });
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json(
        { ok: false, error: "Accreditation is not switched on yet — the onboarding migration has not been applied." },
        { status: 503 },
      );
    }
    const msg = (err as { message?: string })?.message || "";
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(
        { ok: false, error: "There is already a live application for that email. Withdraw it first if you want to start again." },
        { status: 409 },
      );
    }
    throw err;
  }

  await logOnboardingEvent(created.application.id, "super_admin", auth, "onboarding_started", {
    legal_name: legalName,
    email,
    tier: "t1",
  });

  // The raw token exists only here and in the email. If the send fails the
  // application still stands and the link can be reissued — losing the row
  // because an SMTP call failed would be worse than an unsent email.
  let inviteSent = true;
  let inviteError: string | null = null;
  try {
    await sendOnboardingInviteEmail({
      to: email,
      legalName,
      firmName: created.application.firm_name,
      rawToken: created.rawToken,
      origin: new URL(req.url).origin,
    });
    await logOnboardingEvent(created.application.id, "system", null, "onboarding_invite_sent", { to: email });
  } catch (err) {
    inviteSent = false;
    inviteError = (err as { message?: string })?.message || "send failed";
    await logOnboardingEvent(created.application.id, "system", null, "onboarding_invite_failed", {
      to: email,
      error: inviteError,
    });
  }

  return NextResponse.json({
    ok: true,
    application: created.application,
    invite_sent: inviteSent,
    invite_error: inviteError,
  });
}
