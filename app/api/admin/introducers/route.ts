/**
 * GET  /api/admin/introducers  — every introducer firm, with its logins and counts
 * POST /api/admin/introducers  — onboard a firm and its first login (super admin)
 *
 * STAFF (Cloudflare Access). Onboarding is super-admin only: adding an
 * introducer creates an external party who can put client PII into our systems,
 * which is an owner decision, not an operational one.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireStaff, requireSuperAdmin, readJson } from "./_shared";
import { logIntroducerEvent } from "../../introducer/_shared";
import { sendIntroducerInviteEmail } from "../../../../utils/introducer-email";
import { looksLikeEmail, introducerTablesMissing } from "../../../../utils/introducer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { data: firms, error } = await supabase
    .from("introducers")
    .select("id,firm_name,contact_name,contact_email,contact_phone,agreement_ref,agreement_signed_at,abn,status,notes,created_at")
    .order("firm_name", { ascending: true });

  if (introducerTablesMissing(error)) {
    return NextResponse.json(
      { ok: false, error: "Run migrations/20260811_introducer_portal.sql in the Supabase SQL editor to enable the introducer portal." },
      { status: 503 },
    );
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const ids = (firms ?? []).map((f) => f.id);
  const users: Record<string, unknown[]> = {};
  const counts: Record<string, { total: number; open: number }> = {};

  if (ids.length > 0) {
    const [{ data: userRows }, { data: clientRows }] = await Promise.all([
      supabase
        .from("introducer_users")
        .select("id,introducer_id,email,full_name,is_primary,status,last_login_at,invited_at")
        .in("introducer_id", ids)
        .order("invited_at", { ascending: true }),
      supabase
        .from("introducer_clients")
        .select("introducer_id,status")
        .in("introducer_id", ids),
    ]);

    for (const u of (userRows ?? []) as { introducer_id: string }[]) {
      (users[u.introducer_id] ??= []).push(u);
    }
    for (const c of (clientRows ?? []) as { introducer_id: string; status: string }[]) {
      const bucket = (counts[c.introducer_id] ??= { total: 0, open: 0 });
      if (c.status !== "draft") bucket.total += 1;
      if (c.status === "submitted" || c.status === "info_requested") bucket.open += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    introducers: (firms ?? []).map((f) => ({
      ...f,
      users: users[f.id] ?? [],
      referrals: counts[f.id] ?? { total: 0, open: 0 },
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const firmName = typeof body.firm_name === "string" ? body.firm_name.trim() : "";
  const contactEmail = typeof body.contact_email === "string" ? body.contact_email.trim().toLowerCase() : "";
  if (!firmName) return NextResponse.json({ ok: false, error: "Firm name is required." }, { status: 400 });
  if (!looksLikeEmail(contactEmail)) {
    return NextResponse.json({ ok: false, error: "A valid contact email is required." }, { status: 400 });
  }

  // One login per email address globally. Check first so we can say something
  // useful instead of surfacing a unique-index violation.
  const { data: existing } = await supabase
    .from("introducer_users")
    .select("id,introducer_id")
    .eq("email", contactEmail)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "That email already has an introducer login. Suspend the old one first if they've moved firms." },
      { status: 409 },
    );
  }

  const { data: firm, error: firmErr } = await supabase
    .from("introducers")
    .insert({
      firm_name: firmName,
      contact_name: typeof body.contact_name === "string" ? body.contact_name.trim() : null,
      contact_email: contactEmail,
      contact_phone: typeof body.contact_phone === "string" ? body.contact_phone.trim() : null,
      agreement_ref: typeof body.agreement_ref === "string" ? body.agreement_ref.trim() : null,
      agreement_signed_at: typeof body.agreement_signed_at === "string" ? body.agreement_signed_at : null,
      abn: typeof body.abn === "string" ? body.abn.trim() : null,
      notes: typeof body.notes === "string" ? body.notes.trim() : null,
      created_by: auth,
    })
    .select("id,firm_name")
    .single();

  if (firmErr || !firm) {
    return NextResponse.json({ ok: false, error: firmErr?.message ?? "Could not create the introducer." }, { status: 500 });
  }

  const { data: user, error: userErr } = await supabase
    .from("introducer_users")
    .insert({
      introducer_id: firm.id,
      email: contactEmail,
      full_name: typeof body.contact_name === "string" ? body.contact_name.trim() : null,
      is_primary: true,
      invited_by: auth,
    })
    .select("id,email,full_name")
    .single();

  if (userErr || !user) {
    // Leave the firm in place rather than half-rolling-back: an introducer with
    // no login is inert and visible in the list, where it can be fixed by adding
    // a login. A silent delete would lose the agreement details just entered.
    return NextResponse.json(
      { ok: false, error: "The introducer was created but the login could not be added. Add it from the introducer's page." },
      { status: 500 },
    );
  }

  await logIntroducerEvent({
    introducerId: firm.id,
    actorType: "super_admin",
    actor: auth,
    action: "introducer_onboarded",
    detail: { firm_name: firm.firm_name, first_login: user.email },
  });

  const invited = await sendIntroducerInviteEmail({
    to: user.email,
    name: user.full_name,
    firmName: firm.firm_name,
    invitedBy: auth,
  });

  return NextResponse.json(
    { ok: true, introducer_id: firm.id, user_id: user.id, invite_sent: invited.ok, invite_error: invited.ok ? null : invited.error },
    { status: 201 },
  );
}
