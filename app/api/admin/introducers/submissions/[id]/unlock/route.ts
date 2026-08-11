/**
 * POST   /api/admin/introducers/submissions/<id>/unlock  — authorise a change
 * DELETE /api/admin/introducers/submissions/<id>/unlock  — revoke an unused grant
 *
 * SUPER ADMIN ONLY. This is the authorisation Sean holds and nobody else does:
 * the single mechanism by which a submitted referral becomes editable again.
 *
 * Every grant is:
 *   - attributed   — granted_by and reason are mandatory, and both are permanent
 *   - time-boxed   — hours, default 48, capped at a fortnight
 *   - single-use   — spent by the save it authorises, unless deliberately not
 *   - scoped       — named fields by default; 'full' is available but explicit
 *
 * A grant is never implicit and never renews itself. If an introducer needs a
 * second change, that is a second authorisation, with its own reason attached.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../../../_shared";
import { logIntroducerEvent } from "../../../../../introducer/_shared";
import { INTRODUCER_FIELD_KEYS, fieldLabel, displayName } from "../../../../../../../utils/introducer";
import { sendReferralUpdateEmail } from "../../../../../../../utils/introducer-email";

export const dynamic = "force-dynamic";

const DEFAULT_HOURS = 48;
const MAX_HOURS = 24 * 14;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      { ok: false, error: "A reason is required — it's the record of why the change was authorised." },
      { status: 400 },
    );
  }

  const scope = body.scope === "full" ? "full" : "fields";
  const rawFields = Array.isArray(body.fields) ? body.fields : [];
  const fields = rawFields
    .filter((f): f is string => typeof f === "string")
    .filter((f) => INTRODUCER_FIELD_KEYS.includes(f));

  if (scope === "fields" && fields.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Choose which fields they may change, or grant full access explicitly." },
      { status: 400 },
    );
  }

  const hours = Math.min(
    MAX_HOURS,
    Math.max(1, typeof body.hours === "number" && Number.isFinite(body.hours) ? body.hours : DEFAULT_HOURS),
  );
  const singleUse = body.single_use !== false;

  const { data: client } = await supabase
    .from("introducer_clients")
    .select("id,client_ref,status,introducer_id,first_name,last_name,introducers(firm_name,contact_email,contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (!client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  if (client.status === "draft") {
    return NextResponse.json(
      { ok: false, error: "That referral is still a draft — the introducer can already edit it." },
      { status: 409 },
    );
  }
  if (client.status === "declined" || client.status === "withdrawn") {
    return NextResponse.json(
      { ok: false, error: "That referral is closed. Reopening it isn't supported — ask for a new referral." },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + hours * 60 * 60_000).toISOString();

  const { data: grant, error } = await supabase
    .from("introducer_unlock_grants")
    .insert({
      client_id: id,
      granted_by: auth,
      reason,
      scope,
      fields: scope === "full" ? [] : fields,
      single_use: singleUse,
      expires_at: expiresAt,
    })
    .select("id,scope,fields,expires_at,single_use")
    .single();

  if (error || !grant) {
    return NextResponse.json({ ok: false, error: "Could not create the authorisation." }, { status: 500 });
  }

  await logIntroducerEvent({
    clientId: id,
    introducerId: client.introducer_id,
    actorType: "super_admin",
    actor: auth,
    action: "unlock_granted",
    detail: { scope, fields: scope === "full" ? "ALL" : fields, reason, expires_at: expiresAt, single_use: singleUse },
  });

  const firmRaw = (client as { introducers?: unknown }).introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { firm_name?: string; contact_email?: string; contact_name?: string }
    | undefined;

  if (firm?.contact_email) {
    const what =
      scope === "full"
        ? "the whole referral"
        : fields.map(fieldLabel).join(", ");
    void sendReferralUpdateEmail({
      to: firm.contact_email,
      name: firm.contact_name ?? null,
      clientRef: String(client.client_ref ?? ""),
      clientName: displayName(client),
      clientId: id,
      headline: "A change has been authorised",
      body: `You can now update ${what} on this referral. The change window closes in ${hours} hours${singleUse ? ", and applies to one save" : ""}. Everything else stays locked.`,
    }).catch((e) => console.error("[introducer] unlock email failed", e));
  }

  return NextResponse.json({ ok: true, grant });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const grantId = typeof body.grant_id === "string" ? body.grant_id : "";
  if (!grantId) return NextResponse.json({ ok: false, error: "grant_id is required." }, { status: 400 });

  const { data, error } = await supabase
    .from("introducer_unlock_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: auth })
    .eq("id", grantId)
    .eq("client_id", id)
    .is("revoked_at", null)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: "Could not revoke." }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "That authorisation has already been used or revoked." },
      { status: 409 },
    );
  }

  await logIntroducerEvent({
    clientId: id,
    actorType: "super_admin",
    actor: auth,
    action: "unlock_revoked",
    detail: { grant_id: grantId },
  });

  return NextResponse.json({ ok: true });
}
