/**
 * GET  /api/admin/partners  — every partner firm, with logins and deal counts
 * POST /api/admin/partners  — onboard a firm and its first login (super admin)
 *   Body: { firm_name, contact_name, contact_email, contact_phone?, abn?, tier?,
 *           agreement_ref?, agreement_signed_at?, channel_partner_id?, notes?, send_invite? }
 *
 * STAFF (Cloudflare Access). Lives under /api/admin/, never /api/partner/, so
 * the public-portal carve-out can't reach it. Onboarding is super-admin only:
 * it creates an external party who can see our whole stock book.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireStaff, requireSuperAdmin, readJson } from "../introducers/_shared";
import { logPartnerEvent } from "../../partner/_shared";
import { sendPartnerInviteEmail } from "../../../../utils/partner-email";
import { isPartnerTier, partnerTablesMissing } from "../../../../utils/partner";
import { looksLikeEmail } from "../../../../utils/introducer";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Run migrations/20260911_partner_portal.sql in the Supabase SQL editor to enable the partner portal.";

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { data: firms, error } = await supabase
    .from("partners")
    .select(
      "id,firm_name,abn,contact_name,contact_email,contact_phone,channel_partner_id,status," +
        "agreement_ref,agreement_signed_at,tier,feature_grants,branding,notes,created_at",
    )
    .order("firm_name", { ascending: true });

  if (partnerTablesMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (firms ?? []) as unknown as { id: string }[];
  const ids = rows.map((f) => f.id);
  const users: Record<string, unknown[]> = {};
  const counts: Record<string, { clients: number; open: number; settled: number }> = {};

  if (ids.length > 0) {
    const [{ data: userRows }, { data: clientRows }, { data: dealRows }] = await Promise.all([
      supabase
        .from("partner_users")
        .select("id,partner_id,email,full_name,is_primary,status,last_login_at,invited_at")
        .in("partner_id", ids)
        .order("invited_at", { ascending: true }),
      supabase.from("partner_clients").select("partner_id").in("partner_id", ids),
      supabase.from("partner_enquiries").select("partner_id,stage").in("partner_id", ids),
    ]);
    for (const u of (userRows ?? []) as { partner_id: string }[]) (users[u.partner_id] ??= []).push(u);
    const bucket = (id: string) => (counts[id] ??= { clients: 0, open: 0, settled: 0 });
    for (const c of (clientRows ?? []) as { partner_id: string }[]) bucket(c.partner_id).clients += 1;
    for (const d of (dealRows ?? []) as { partner_id: string; stage: string }[]) {
      if (["requested", "hold", "eoi", "unconditional"].includes(d.stage)) bucket(d.partner_id).open += 1;
      if (d.stage === "settled") bucket(d.partner_id).settled += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    partners: rows.map((f) => ({
      ...f,
      users: users[f.id] ?? [],
      counts: counts[f.id] ?? { clients: 0, open: 0, settled: 0 },
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() || null : null);
  const firmName = str("firm_name");
  const contactEmail = str("contact_email")?.toLowerCase() ?? "";
  if (!firmName) return NextResponse.json({ ok: false, error: "Firm name is required." }, { status: 400 });
  if (!looksLikeEmail(contactEmail)) {
    return NextResponse.json({ ok: false, error: "A valid contact email is required." }, { status: 400 });
  }
  if (body.tier !== undefined && !isPartnerTier(body.tier)) {
    return NextResponse.json({ ok: false, error: "Unknown tier." }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("partner_users")
    .select("id")
    .eq("email", contactEmail)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "That email already has a partner login. Suspend it first if they've moved firms." },
      { status: 409 },
    );
  }

  const { data: firm, error: firmErr } = await supabase
    .from("partners")
    .insert({
      firm_name: firmName,
      abn: str("abn"),
      contact_name: str("contact_name"),
      contact_email: contactEmail,
      contact_phone: str("contact_phone"),
      channel_partner_id: str("channel_partner_id"),
      agreement_ref: str("agreement_ref"),
      agreement_signed_at: str("agreement_signed_at"),
      tier: isPartnerTier(body.tier) ? body.tier : "basic",
      notes: str("notes"),
      created_by: auth,
    })
    .select("id,firm_name")
    .single();
  if (partnerTablesMissing(firmErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
  if (firmErr || !firm) {
    return NextResponse.json({ ok: false, error: firmErr?.message ?? "Could not create the partner." }, { status: 500 });
  }

  const { data: user, error: userErr } = await supabase
    .from("partner_users")
    .insert({
      partner_id: firm.id,
      email: contactEmail,
      full_name: str("contact_name"),
      phone: str("contact_phone"),
      is_primary: true,
      invited_by: auth,
    })
    .select("id,email,full_name")
    .single();
  if (userErr || !user) {
    // Leave the firm: with no login it is inert and visible, and fixable by adding one.
    return NextResponse.json(
      { ok: false, error: "The firm was created but its login could not be added. Add it from the partner's card." },
      { status: 500 },
    );
  }

  await logPartnerEvent({
    partnerId: firm.id,
    actorType: "super_admin",
    actor: auth,
    action: "partner_onboarded",
    detail: { firm_name: firm.firm_name, first_login: user.email },
  });

  let invite: { ok: boolean; error?: string } = { ok: false, error: "not requested" };
  if (body.send_invite !== false) {
    invite = await sendPartnerInviteEmail({
      to: user.email,
      name: user.full_name,
      firmName: firm.firm_name,
      invitedBy: auth,
    });
  }

  return NextResponse.json(
    { ok: true, partner_id: firm.id, user_id: user.id, invite_sent: invite.ok, invite_error: invite.ok ? null : invite.error },
    { status: 201 },
  );
}
