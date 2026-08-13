/**
 * GET    /api/introducer/clients/<id>  — one referral, with what's open on it
 * PATCH  /api/introducer/clients/<id>  — save changes, if they're permitted
 * DELETE /api/introducer/clients/<id>  — discard an unsubmitted draft
 *
 * PUBLIC (session-scoped). Every path loads the row through `loadOwnClient`,
 * which filters on the session's introducer id — an id belonging to another firm
 * simply doesn't exist as far as this route is concerned.
 *
 * The PATCH is the heart of the lock. It asks `evaluateEdit` whether the change
 * is permitted and refuses if not; the database trigger then refuses a second
 * time on the way in. Two independent gates, because "submitted means locked" is
 * the promise the whole portal rests on.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import {
  requireIntroducer,
  loadOwnClient,
  activeGrantFor,
  openInfoRequests,
  logIntroducerEvent,
  readJson,
} from "../../_shared";
import {
  pickEditableFields,
  evaluateEdit,
  toPortalView,
  missingRequiredFields,
  fieldLabel,
  INTRODUCER_FIELD_KEYS,
  CONSENT_STATEMENT,
} from "../../../../../utils/introducer";

export const dynamic = "force-dynamic";

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * Which fields may this introducer touch right now, and why?
 * Drives the form: anything not in `editable` renders read-only, so the lock is
 * visible rather than only being discovered on save.
 */
function editabilityOf(
  record: Record<string, unknown>,
  grant: Awaited<ReturnType<typeof activeGrantFor>>,
  infoReqs: Awaited<ReturnType<typeof openInfoRequests>>,
) {
  const status = String(record.status ?? "draft");
  if (status === "draft") {
    return { editable: [...INTRODUCER_FIELD_KEYS], basis: "draft" as const };
  }
  if (grant) {
    const fields = grant.scope === "full" ? [...INTRODUCER_FIELD_KEYS] : grant.fields ?? [];
    return { editable: fields, basis: "authorised" as const, grantExpiresAt: grant.expires_at };
  }
  const open = infoReqs.filter((r) => r.status === "open");
  if (open.length > 0) {
    // Only fields that are still blank — an info request lets them supply what's
    // missing, never rewrite what they already told us.
    const asked = new Set(open.flatMap((r) => r.fields ?? []));
    return {
      editable: [...asked].filter((f) => isBlank(record[f])),
      basis: "info_request" as const,
    };
  }
  return { editable: [] as string[], basis: "locked" as const };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const [grant, infoReqs] = await Promise.all([activeGrantFor(record.id), openInfoRequests(record.id)]);

  const { data: docs } = await supabase
    .from("introducer_documents")
    .select("id,label,filename,status,size_bytes,uploaded_at,info_request_id")
    .eq("client_id", record.id)
    .neq("status", "replaced")
    .order("uploaded_at", { ascending: true });

  // The introducer's own view of the audit trail: their actions and our
  // decisions, never internal chatter. `detail` is deliberately omitted.
  const { data: events } = await supabase
    .from("introducer_events")
    .select("action,actor_type,created_at")
    .eq("client_id", record.id)
    .in("action", [
      "draft_created",
      "submitted",
      "info_requested",
      "info_supplied",
      "unlock_granted",
      "accepted",
      "declined",
      "withdrawn",
      "stage_updated",
    ])
    .order("created_at", { ascending: true })
    .limit(100);

  const editability = editabilityOf(record, grant, infoReqs);

  return NextResponse.json({
    ok: true,
    client: toPortalView(record),
    missing_required: missingRequiredFields(record).map((k) => ({ key: k, label: fieldLabel(k) })),
    consent_statement: CONSENT_STATEMENT,
    ...editability,
    info_requests: (infoReqs as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      message: r.message,
      fields: ((r.fields as string[]) ?? []).map((f) => ({ key: f, label: fieldLabel(f) })),
      documents: (r.documents as string[]) ?? [],
      due_at: r.due_at ?? null,
      created_at: r.created_at,
    })),
    documents: docs ?? [],
    history: events ?? [],
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const changes = pickEditableFields(body);
  const [grant, infoReqs] = await Promise.all([activeGrantFor(record.id), openInfoRequests(record.id)]);

  const decision = evaluateEdit(record, changes, { grant, infoRequests: infoReqs });
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: decision.reason, blocked_fields: decision.blockedFields, code: "locked" },
      { status: 403 },
    );
  }

  const { data, error } = await supabase
    .from("introducer_clients")
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("introducer_id", auth.introducerId)   // belt-and-braces: the tenant filter again
    .select("*")
    .single();

  if (error || !data) {
    // The database trigger speaks in SQL. If it fired, the app-level check and
    // the database disagreed — surface it plainly rather than as a 500, and log
    // it, because that disagreement is a bug worth knowing about.
    const locked = error?.message?.includes("is locked");
    if (locked) {
      console.error("[introducer] lock trigger rejected a write the app allowed", {
        client_id: record.id,
        via: decision.via,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: locked
          ? "This referral is locked. Ask NextKey to authorise the change."
          : "Could not save. Please try again.",
      },
      { status: locked ? 403 : 500 },
    );
  }

  // A grant is spent by the save it authorised, so an unlock can't become a
  // standing permission.
  if (decision.via === "grant" && decision.grantId) {
    const { data: g } = await supabase
      .from("introducer_unlock_grants")
      .select("single_use")
      .eq("id", decision.grantId)
      .maybeSingle();
    if (g?.single_use !== false) {
      await supabase
        .from("introducer_unlock_grants")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", decision.grantId);
    }
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: record.status === "draft" ? "draft_saved" : "authorised_change_saved",
    detail: { fields: Object.keys(changes), via: decision.via },
  });

  return NextResponse.json({ ok: true, client: toPortalView(data) });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  // Only a draft can be discarded. Once submitted, the referral is a record of
  // something that happened — deleting it would erase the audit trail with it.
  if (record.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "Submitted referrals can't be deleted. Contact NextKey if this was sent in error." },
      { status: 403 },
    );
  }

  const { error } = await supabase
    .from("introducer_clients")
    .delete()
    .eq("id", record.id)
    .eq("introducer_id", auth.introducerId)
    .eq("status", "draft");

  if (error) return NextResponse.json({ ok: false, error: "Could not delete the draft." }, { status: 500 });

  await logIntroducerEvent({
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "draft_deleted",
    detail: { client_ref: record.client_ref ?? null },
  });

  return NextResponse.json({ ok: true });
}
