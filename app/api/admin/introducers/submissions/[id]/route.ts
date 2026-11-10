/**
 * GET   /api/admin/introducers/submissions/<id>  — full referral, both sides of it
 * PATCH /api/admin/introducers/submissions/<id>  — move the stage / write to the introducer
 *
 * STAFF. Unlike the portal side, this reads the whole row: staff see the
 * internal notes and the decision reasons. The PATCH is limited to the two
 * things staff should be able to change without the owner — where the referral
 * has got to, and the message the introducer reads.
 *
 * It deliberately CANNOT touch the client-detail fields. Correcting a submitted
 * referral is the introducer's job under an unlock grant, so the record keeps
 * saying who supplied what.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireStaff, readJson } from "../../_shared";
import { logIntroducerEvent } from "../../../../introducer/_shared";
import { isValidStage, stageLabel, fieldLabel } from "../../../../../../utils/introducer";
import { isSuperAdmin } from "../../../../../../utils/super-admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  const { data: client, error } = await supabase
    .from("introducer_clients")
    .select("*, introducers(firm_name,contact_email,contact_name,agreement_ref,status)")
    .eq("id", id)
    .maybeSingle();

  if (error || !client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const [{ data: infoReqs }, { data: grants }, { data: docs }, { data: events }, { data: submitter }] =
    await Promise.all([
      supabase
        .from("introducer_info_requests")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("introducer_unlock_grants")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("introducer_documents")
        .select("id,label,filename,status,size_bytes,mime_type,uploaded_at,check_notes")
        .eq("client_id", id)
        .neq("status", "replaced")
        .order("uploaded_at", { ascending: true }),
      supabase
        .from("introducer_events")
        .select("action,actor,actor_type,detail,created_at")
        .eq("client_id", id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("introducer_users")
        .select("email,full_name")
        .eq("id", (client as { submitted_by?: string }).submitted_by ?? "00000000-0000-0000-0000-000000000000")
        .maybeSingle(),
    ]);

  const firmRaw = (client as { introducers?: unknown }).introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as Record<string, unknown> | undefined;

  return NextResponse.json({
    ok: true,
    client,
    firm: firm ?? null,
    submitted_by: submitter ?? null,
    stage_label: stageLabel((client as { stage?: string }).stage),
    info_requests: infoReqs ?? [],
    unlock_grants: (grants ?? []).map((g) => ({
      ...g,
      field_labels: ((g.fields as string[]) ?? []).map(fieldLabel),
    })),
    documents: docs ?? [],
    events: events ?? [],
    // Lets the UI hide the accept/decline/unlock controls rather than offering
    // buttons that will 403 — the point is that staff can see the state of play
    // without being invited to act beyond their authority.
    viewer_is_super_admin: isSuperAdmin(auth),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const actions: string[] = [];

  if (body.stage !== undefined) {
    if (!isValidStage(body.stage)) {
      return NextResponse.json({ ok: false, error: "Unknown stage." }, { status: 400 });
    }
    patch.stage = body.stage;
    patch.stage_updated_at = new Date().toISOString();
    actions.push("stage_updated");
  }

  if (body.message_to_introducer !== undefined) {
    const msg = typeof body.message_to_introducer === "string" ? body.message_to_introducer.trim() : "";
    patch.message_to_introducer = msg || null;
    actions.push("message_updated");
  }

  if (body.internal_notes !== undefined && typeof body.internal_notes === "string") {
    patch.decision_reason = body.internal_notes.trim() || null;
    actions.push("internal_note_updated");
  }

  if (actions.length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("introducer_clients")
    .update(patch)
    .eq("id", id)
    .select("id,introducer_id,stage,message_to_introducer")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Not found." }, { status: 404 });
  }

  for (const action of actions) {
    await logIntroducerEvent({
      clientId: id,
      introducerId: data.introducer_id,
      actorType: isSuperAdmin(auth) ? "super_admin" : "staff",
      actor: auth,
      action,
      detail: action === "stage_updated" ? { stage: data.stage } : {},
    });
  }

  return NextResponse.json({ ok: true, client: data });
}
