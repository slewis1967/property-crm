/**
 * POST  /api/admin/introducers/<id>/users  — add a login to a firm
 * PATCH /api/admin/introducers/<id>/users  — suspend or reactivate one
 *
 * SUPER ADMIN. Suspending revokes every live session for that person on the
 * spot — the whole point of suspending someone is that they're out now.
 *
 * Logins are never repointed to a different firm. If someone moves, their old
 * login is suspended and a new one created, so every referral in the audit trail
 * still names the firm it was actually submitted under.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../../_shared";
import { logIntroducerEvent } from "../../../../introducer/_shared";
import { revokeAllSessionsForUser } from "../../../../../../utils/introducer-auth";
import { sendIntroducerInviteEmail } from "../../../../../../utils/introducer-email";
import { looksLikeEmail } from "../../../../../../utils/introducer";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!looksLikeEmail(email)) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }

  const { data: firm } = await supabase
    .from("introducers")
    .select("id,firm_name,status")
    .eq("id", id)
    .maybeSingle();
  if (!firm) return NextResponse.json({ ok: false, error: "Introducer not found." }, { status: 404 });
  if (firm.status !== "active") {
    return NextResponse.json(
      { ok: false, error: "That introducer isn't active. Reactivate the firm before adding logins." },
      { status: 409 },
    );
  }

  const { data: user, error } = await supabase
    .from("introducer_users")
    .insert({
      introducer_id: id,
      email,
      full_name: typeof body.full_name === "string" ? body.full_name.trim() : null,
      is_primary: body.is_primary === true,
      invited_by: auth,
    })
    .select("id,email,full_name")
    .single();

  if (error || !user) {
    const duplicate = error?.code === "23505";
    return NextResponse.json(
      {
        ok: false,
        error: duplicate
          ? "That email already has an introducer login."
          : error?.message ?? "Could not add the login.",
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  await logIntroducerEvent({
    introducerId: id,
    actorType: "super_admin",
    actor: auth,
    action: "login_added",
    detail: { email },
  });

  const invited = await sendIntroducerInviteEmail({
    to: user.email,
    name: user.full_name,
    firmName: firm.firm_name,
    invitedBy: auth,
  });

  return NextResponse.json({ ok: true, user, invite_sent: invited.ok }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const status = body.status === "suspended" || body.status === "active" ? body.status : null;
  if (!userId || !status) {
    return NextResponse.json({ ok: false, error: "user_id and status are required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("introducer_users")
    .update({ status })
    .eq("id", userId)
    .eq("introducer_id", id)      // the login must belong to the firm in the path
    .select("id,email,status")
    .single();

  if (error || !data) return NextResponse.json({ ok: false, error: "Login not found." }, { status: 404 });

  if (status === "suspended") await revokeAllSessionsForUser(userId, "user_suspended");

  await logIntroducerEvent({
    introducerId: id,
    actorType: "super_admin",
    actor: auth,
    action: status === "suspended" ? "login_suspended" : "login_reactivated",
    detail: { email: data.email },
  });

  return NextResponse.json({ ok: true, user: data });
}
