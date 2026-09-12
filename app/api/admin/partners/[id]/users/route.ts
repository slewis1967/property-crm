/**
 * POST /api/admin/partners/<id>/users   (super admin)
 *   Body: { email, full_name?, phone?, send_invite? }
 *
 * STAFF (Cloudflare Access). Adds a login to a firm, up to the tier's user cap
 * (TIER_DEFINITIONS.maxUsers) — extra seats are one of the things a higher tier
 * sells. Suspended logins don't count against the cap.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../../../introducers/_shared";
import { logPartnerEvent } from "../../../../partner/_shared";
import { sendPartnerInviteEmail } from "../../../../../../utils/partner-email";
import { normaliseTier, TIER_DEFINITIONS } from "../../../../../../utils/partner";
import { looksLikeEmail } from "../../../../../../utils/introducer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!looksLikeEmail(email)) return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim() || null : null;

  const { data: firm } = await supabase.from("partners").select("id,firm_name,tier,status").eq("id", id).maybeSingle();
  if (!firm) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const tier = TIER_DEFINITIONS[normaliseTier(firm.tier)];
  if (tier.maxUsers !== null) {
    const { count } = await supabase
      .from("partner_users")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", id)
      .eq("status", "active");
    if ((count ?? 0) >= tier.maxUsers) {
      return NextResponse.json(
        {
          ok: false,
          error: `${tier.label} includes ${tier.maxUsers} login${tier.maxUsers === 1 ? "" : "s"}. Upgrade the tier or suspend an existing login first.`,
          code: "user_cap",
        },
        { status: 409 },
      );
    }
  }

  const { data: existing } = await supabase.from("partner_users").select("id").eq("email", email).maybeSingle();
  if (existing) return NextResponse.json({ ok: false, error: "That email already has a partner login." }, { status: 409 });

  const { data: user, error } = await supabase
    .from("partner_users")
    .insert({ partner_id: id, email, full_name: fullName, phone, invited_by: auth })
    .select("id,email,full_name")
    .single();
  if (error || !user) return NextResponse.json({ ok: false, error: error?.message ?? "Could not add the login." }, { status: 500 });

  await logPartnerEvent({
    partnerId: id,
    actorType: "super_admin",
    actor: auth,
    action: "login_added",
    detail: { email },
  });

  let invite: { ok: boolean; error?: string } = { ok: false, error: "not requested" };
  if (body.send_invite !== false && firm.status === "active") {
    invite = await sendPartnerInviteEmail({ to: email, name: fullName, firmName: firm.firm_name, invitedBy: auth });
  }
  return NextResponse.json(
    { ok: true, user_id: user.id, invite_sent: invite.ok, invite_error: invite.ok ? null : invite.error },
    { status: 201 },
  );
}
