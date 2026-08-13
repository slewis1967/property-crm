import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../_shared";
import { supabase } from "../../../../../../../utils/supabase";
import {
  findById,
  setState,
  logOnboardingEvent,
} from "../../../../../../../utils/introducer-onboarding-db";
import { canActivate, onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { sendIntroducerInviteEmail } from "../../../../../../../utils/introducer-email";

/**
 * Activation — the end of the runway.
 *
 * Creates the introducer firm and its first portal login, links them back to the
 * application, and sends the portal invitation. This is what
 * POST /api/admin/introducers has always done; the difference is that it now
 * happens at the END of accreditation rather than instead of it.
 *
 * ONE-WAY. The database guard refuses to change `introducer_id` once set or to
 * move an activated application back into the pipeline, so a double-click or a
 * retried request cannot create a second firm — the second call fails the state
 * check below, and would fail at the database even if it did not.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let app;
  try {
    app = await findById(id);
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    throw err;
  }
  if (!app) return NextResponse.json({ ok: false, error: "No such application." }, { status: 404 });

  if (app.introducer_id) {
    return NextResponse.json(
      { ok: false, error: "This application has already been activated." },
      { status: 409 },
    );
  }

  if (!canActivate(app.state)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          app.state === "certificate_issued" || app.state === "agreement_sent"
            ? "They have not signed the introducer agreement yet. Portal access opens when they do."
            : `This application is ${app.state.replace(/_/g, " ")} — it is not ready to activate.`,
      },
      { status: 409 },
    );
  }

  // Last check before we create anything: nobody has claimed this email in the
  // meantime. Better a clear message than a unique-index violation.
  const { data: taken } = await supabase
    .from("introducer_users")
    .select("id")
    .eq("email", app.email)
    .maybeSingle();
  if (taken) {
    return NextResponse.json(
      { ok: false, error: "That email already has an introducer login. Suspend the old one before activating this application." },
      { status: 409 },
    );
  }

  const firmName = app.firm_name?.trim() || app.legal_name;

  const { data: firm, error: firmErr } = await supabase
    .from("introducers")
    .insert({
      firm_name: firmName,
      contact_name: app.legal_name,
      contact_email: app.email,
      contact_phone: app.phone,
      abn: app.abn,
      // The accreditation number IS the agreement reference: it is what the
      // register, the certificate and the signed agreement all cite.
      agreement_ref: app.accreditation_no,
      agreement_signed_at: new Date().toISOString(),
      created_by: auth,
    })
    .select("id,firm_name")
    .single();

  if (firmErr || !firm) {
    return NextResponse.json({ ok: false, error: "Could not create the introducer firm." }, { status: 500 });
  }

  const { error: userErr } = await supabase.from("introducer_users").insert({
    introducer_id: firm.id,
    email: app.email,
    full_name: app.legal_name,
    is_primary: true,
    invited_by: auth,
  });

  if (userErr) {
    // Deliberately NOT rolling back the firm, matching the existing onboarding
    // route: a firm with no login is recoverable by adding one, whereas a
    // half-deleted firm loses the accreditation link we just established.
    await logOnboardingEvent(id, "super_admin", auth, "activation_login_failed", {
      introducer_id: firm.id,
      error: userErr.message,
    });
    return NextResponse.json(
      { ok: false, error: "The firm was created but its login was not. Add the login from the register." },
      { status: 500 },
    );
  }

  await setState(id, "activated", {
    introducer_id: firm.id,
    activated_at: new Date().toISOString(),
  });

  await logOnboardingEvent(id, "super_admin", auth, "activated", {
    introducer_id: firm.id,
    accreditation_no: app.accreditation_no,
  });

  let inviteSent = true;
  try {
    await sendIntroducerInviteEmail({
      to: app.email,
      name: app.legal_name,
      firmName: firm.firm_name,
      invitedBy: auth,
    });
  } catch (err) {
    inviteSent = false;
    await logOnboardingEvent(id, "system", null, "activation_invite_failed", {
      error: (err as { message?: string })?.message ?? "send failed",
    });
  }

  return NextResponse.json({
    ok: true,
    introducer_id: firm.id,
    firm_name: firm.firm_name,
    invite_sent: inviteSent,
  });
}
