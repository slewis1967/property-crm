/**
 * PATCH /api/admin/partners/users/<userId>   (super admin)
 *   Body: { status: "active" | "suspended" } | { action: "resend_invite" }
 *
 * STAFF (Cloudflare Access). Suspending a login revokes its sessions at once.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../../../introducers/_shared";
import { logPartnerEvent } from "../../../../partner/_shared";
import { revokeAllSessionsForUser } from "../../../../../../utils/partner-auth";
import { sendPartnerInviteEmail } from "../../../../../../utils/partner-email";
import { normaliseTier, TIER_DEFINITIONS } from "../../../../../../utils/partner";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { userId } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const { data: user } = await supabase
    .from("partner_users")
    .select("id,partner_id,email,full_name,status,partners(firm_name,status)")
    .eq("id", userId)
    .maybeSingle();
  if (!user) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const firmRaw = (user as { partners?: unknown }).partners;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as { firm_name?: string; status?: string } | undefined;

  if (body.action === "resend_invite") {
    if (user.status !== "active" || firm?.status !== "active") {
      return NextResponse.json({ ok: false, error: "Reactivate the login (and firm) before re-sending." }, { status: 409 });
    }
    const sent = await sendPartnerInviteEmail({
      to: user.email,
      name: user.full_name,
      firmName: firm?.firm_name ?? "",
      invitedBy: auth,
    });
    return NextResponse.json({ ok: sent.ok, error: sent.ok ? null : sent.error }, { status: sent.ok ? 200 : 502 });
  }

  if (body.status !== "active" && body.status !== "suspended") {
    return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
  }

  // Reactivating uses a seat just as adding a login does. Without this, suspend
  // A → add C → reactivate A puts a Basic firm on three logins against a cap of two.
  if (body.status === "active" && user.status !== "active") {
    const { data: firmRow } = await supabase.from("partners").select("tier").eq("id", user.partner_id).maybeSingle();
    const tier = TIER_DEFINITIONS[normaliseTier(firmRow?.tier)];
    if (tier.maxUsers !== null) {
      const { count } = await supabase
        .from("partner_users")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", user.partner_id)
        .eq("status", "active");
      if ((count ?? 0) >= tier.maxUsers) {
        return NextResponse.json(
          { ok: false, error: `${tier.label} includes ${tier.maxUsers} logins. Upgrade the tier or suspend another login first.`, code: "user_cap" },
          { status: 409 },
        );
      }
    }
  }

  const { error } = await supabase.from("partner_users").update({ status: body.status }).eq("id", userId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (body.status === "suspended") await revokeAllSessionsForUser(userId, "login_suspended");

  await logPartnerEvent({
    partnerId: user.partner_id,
    actorType: "super_admin",
    actor: auth,
    action: body.status === "suspended" ? "login_suspended" : "login_reactivated",
    detail: { email: user.email },
  });
  return NextResponse.json({ ok: true });
}
