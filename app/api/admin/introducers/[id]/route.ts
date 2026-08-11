/**
 * PATCH /api/admin/introducers/<id>  — update a firm's details or status
 *
 * SUPER ADMIN. Suspending or terminating a firm is an access decision: it must
 * cut off every live session for every login at that firm immediately, not when
 * their cookies happen to expire. Revocation is the point of the action, so it
 * happens here rather than being left to a nightly sweep.
 *
 * Note `/submissions` is a static sibling segment and takes routing precedence
 * over this dynamic `[id]`, so a firm id can never shadow the review queue.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireSuperAdmin, readJson } from "../_shared";
import { logIntroducerEvent } from "../../../introducer/_shared";
import { revokeAllSessionsForFirm } from "../../../../../utils/introducer-auth";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["active", "suspended", "terminated"]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ["firm_name", "contact_name", "contact_email", "contact_phone", "agreement_ref", "abn", "notes"]) {
    if (typeof body[key] === "string") patch[key] = (body[key] as string).trim() || null;
  }
  if (typeof body.agreement_signed_at === "string" || body.agreement_signed_at === null) {
    patch.agreement_signed_at = body.agreement_signed_at;
  }

  let statusChange: string | null = null;
  if (typeof body.status === "string") {
    if (!STATUSES.has(body.status)) {
      return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
    }
    patch.status = body.status;
    statusChange = body.status;
  }

  const { data, error } = await supabase
    .from("introducers")
    .update(patch)
    .eq("id", id)
    .select("id,firm_name,status")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Introducer not found." }, { status: 404 });
  }

  if (statusChange && statusChange !== "active") {
    await revokeAllSessionsForFirm(id, `firm_${statusChange}`);
  }

  await logIntroducerEvent({
    introducerId: id,
    actorType: "super_admin",
    actor: auth,
    action: statusChange ? `introducer_${statusChange}` : "introducer_updated",
    detail: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return NextResponse.json({ ok: true, introducer: data });
}
