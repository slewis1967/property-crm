/**
 * POST   /api/admin/introducers/submissions/<id>/info-request  — ask for more
 * DELETE /api/admin/introducers/submissions/<id>/info-request  — cancel one
 *
 * STAFF. Asking an introducer for something we're missing is ordinary casework,
 * so it doesn't need the owner. What it opens is deliberately narrow: the named
 * fields may be FILLED IN if they're currently blank, and the named documents
 * may be uploaded. Nothing already submitted becomes editable — that still needs
 * an unlock grant from the super admin.
 *
 * Asking for a field that already has a value is rejected here rather than
 * silently doing nothing, because "I asked and they ignored it" is otherwise
 * indistinguishable from "the portal never let them".
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../../utils/supabase";
import { requireStaff, readJson } from "../../../_shared";
import { logIntroducerEvent } from "../../../../../introducer/_shared";
import { INTRODUCER_FIELD_KEYS, fieldLabel, displayName } from "../../../../../../../utils/introducer";
import { sendInfoRequestEmail } from "../../../../../../../utils/introducer-email";
import { isSuperAdmin } from "../../../../../../../utils/super-admin";

export const dynamic = "force-dynamic";

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "Tell them what you need — the message is what they read." }, { status: 400 });
  }

  const fields = (Array.isArray(body.fields) ? body.fields : [])
    .filter((f): f is string => typeof f === "string")
    .filter((f) => INTRODUCER_FIELD_KEYS.includes(f));
  const documents = (Array.isArray(body.documents) ? body.documents : [])
    .filter((d): d is string => typeof d === "string")
    .map((d) => d.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (fields.length === 0 && documents.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Choose at least one field or document to request." },
      { status: 400 },
    );
  }

  const { data: client } = await supabase
    .from("introducer_clients")
    .select("*, introducers(firm_name,contact_email,contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (!client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const record = client as Record<string, unknown>;

  if (record.status === "draft") {
    return NextResponse.json(
      { ok: false, error: "That referral hasn't been submitted yet." },
      { status: 409 },
    );
  }
  if (record.status === "declined" || record.status === "withdrawn") {
    return NextResponse.json({ ok: false, error: "That referral is closed." }, { status: 409 });
  }

  const alreadyAnswered = fields.filter((f) => !isBlank(record[f]));
  if (alreadyAnswered.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `${alreadyAnswered.map(fieldLabel).join(", ")} ${alreadyAnswered.length === 1 ? "has" : "have"} already been supplied. To have those changed, grant an unlock instead.`,
        code: "needs_unlock",
        fields: alreadyAnswered,
      },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: infoReq, error } = await supabase
    .from("introducer_info_requests")
    .insert({
      client_id: id,
      requested_by: auth,
      message,
      fields,
      documents,
      due_at: typeof body.due_at === "string" ? body.due_at : null,
    })
    .select("id,fields,documents,message,due_at")
    .single();

  if (error || !infoReq) {
    return NextResponse.json({ ok: false, error: "Could not create the request." }, { status: 500 });
  }

  // Flip the referral so both sides can see who it's sitting with.
  await supabase
    .from("introducer_clients")
    .update({ status: "info_requested", updated_at: now })
    .eq("id", id)
    .eq("status", "submitted");

  await logIntroducerEvent({
    clientId: id,
    introducerId: String(record.introducer_id),
    actorType: isSuperAdmin(auth) ? "super_admin" : "staff",
    actor: auth,
    action: "info_requested",
    detail: { fields, documents, info_request_id: infoReq.id },
  });

  const firmRaw = record.introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { contact_email?: string; contact_name?: string }
    | undefined;

  let emailed = false;
  if (firm?.contact_email) {
    const sent = await sendInfoRequestEmail({
      to: firm.contact_email,
      name: firm.contact_name ?? null,
      clientRef: String(record.client_ref ?? ""),
      clientName: displayName(record as { first_name?: string; last_name?: string }),
      message,
      fieldLabels: fields.map(fieldLabel),
      documentLabels: documents,
      clientId: id,
    });
    emailed = sent.ok;
  }

  return NextResponse.json({ ok: true, info_request: infoReq, emailed });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const requestId = typeof body.info_request_id === "string" ? body.info_request_id : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "info_request_id is required." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("introducer_info_requests")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("id", requestId)
    .eq("client_id", id)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: "Could not cancel." }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "That request isn't open." }, { status: 409 });

  // If nothing else is outstanding, the referral is back with us.
  const { data: stillOpen } = await supabase
    .from("introducer_info_requests")
    .select("id")
    .eq("client_id", id)
    .eq("status", "open")
    .limit(1);
  if ((stillOpen ?? []).length === 0) {
    await supabase
      .from("introducer_clients")
      .update({ status: "submitted", updated_at: now })
      .eq("id", id)
      .eq("status", "info_requested");
  }

  await logIntroducerEvent({
    clientId: id,
    actorType: isSuperAdmin(auth) ? "super_admin" : "staff",
    actor: auth,
    action: "info_request_cancelled",
    detail: { info_request_id: requestId },
  });

  return NextResponse.json({ ok: true });
}
