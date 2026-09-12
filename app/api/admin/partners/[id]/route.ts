/**
 * PATCH /api/admin/partners/<id>   (super admin)
 *   Body (any of): { status, tier, feature_grants, branding, agreement_ref,
 *                    agreement_signed_at, contact_*, abn, notes }
 *
 * STAFF (Cloudflare Access). Tier, extras and white-label are what a firm has
 * paid for, so changing them is an owner decision. Branding is ONLY writable
 * here — the portal has no route that can change it — which is what "white-label
 * on request, we do it" means in code.
 *
 * Suspending or terminating a firm revokes every live session at once; the
 * session resolver re-checks firm status on every request anyway, but killing
 * the rows makes the audit trail say so.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../../introducers/_shared";
import { logPartnerEvent } from "../../../partner/_shared";
import { revokeAllSessionsForFirm } from "../../../../../utils/partner-auth";
import { isPartnerFeature, isPartnerTier, parseBranding } from "../../../../../utils/partner";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["active", "suspended", "terminated"]);
const TEXT_FIELDS = ["agreement_ref", "contact_name", "contact_email", "contact_phone", "abn", "notes"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !STATUSES.has(body.status)) {
      return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
    }
    patch.status = body.status;
  }
  if (body.tier !== undefined) {
    if (!isPartnerTier(body.tier)) return NextResponse.json({ ok: false, error: "Unknown tier." }, { status: 400 });
    patch.tier = body.tier;
  }
  if (body.feature_grants !== undefined) {
    if (!Array.isArray(body.feature_grants) || !body.feature_grants.every(isPartnerFeature)) {
      return NextResponse.json({ ok: false, error: "Unknown feature in grants." }, { status: 400 });
    }
    patch.feature_grants = [...new Set(body.feature_grants)];
  }
  if (body.branding !== undefined) {
    const parsed = parseBranding(body.branding);
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.errors.join(" ") }, { status: 400 });
    patch.branding = parsed.value;
  }
  if (body.agreement_signed_at !== undefined) {
    patch.agreement_signed_at = typeof body.agreement_signed_at === "string" && body.agreement_signed_at
      ? body.agreement_signed_at
      : null;
  }
  for (const k of TEXT_FIELDS) {
    if (body[k] !== undefined) patch[k] = typeof body[k] === "string" ? (body[k] as string).trim() || null : null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
  }
  changed.push(...Object.keys(patch));
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("partners")
    .update(patch)
    .eq("id", id)
    .select("id,firm_name,status,tier,feature_grants,branding")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  if (patch.status && patch.status !== "active") {
    await revokeAllSessionsForFirm(id, `firm_${String(patch.status)}`);
  }

  await logPartnerEvent({
    partnerId: id,
    actorType: "super_admin",
    actor: auth,
    action: "partner_updated",
    // Values for the commercial fields, names only for the rest (notes can be long).
    detail: {
      changed,
      status: patch.status ?? undefined,
      tier: patch.tier ?? undefined,
      feature_grants: patch.feature_grants ?? undefined,
      branding: patch.branding ?? undefined,
    },
  });

  return NextResponse.json({ ok: true, partner: data });
}
