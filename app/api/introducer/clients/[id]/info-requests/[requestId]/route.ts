/**
 * POST /api/introducer/clients/<id>/info-requests/<requestId>
 *   Body: { action: "answer" }
 *
 * PUBLIC (session-scoped). Closes an information request once the introducer
 * says they've supplied everything — and with it, closes the additive window
 * that request opened. The referral re-locks immediately.
 *
 * We check the request is actually satisfiable before closing it: every field we
 * asked for is now filled, and every document we asked for has arrived. Letting
 * someone close a request they hadn't answered would strand the referral in a
 * state where we're waiting on them and they think they're waiting on us.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../../utils/supabase";
import { requireIntroducer, loadOwnClient, logIntroducerEvent, readJson } from "../../../../_shared";
import { fieldLabel } from "../../../../../../../utils/introducer";

export const dynamic = "force-dynamic";

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id, requestId } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "answer") {
    return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  }

  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const { data: infoReq } = await supabase
    .from("introducer_info_requests")
    .select("id,fields,documents,status")
    .eq("id", requestId)
    .eq("client_id", record.id)
    .maybeSingle();

  if (!infoReq) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  if (infoReq.status !== "open") {
    return NextResponse.json({ ok: true, already: true });
  }

  const outstandingFields = ((infoReq.fields as string[]) ?? []).filter((f) => isBlank(record[f]));

  const wantedDocs = ((infoReq.documents as string[]) ?? []).map((d) => d.toLowerCase());
  let outstandingDocs: string[] = [];
  if (wantedDocs.length > 0) {
    const { data: docs } = await supabase
      .from("introducer_documents")
      .select("label")
      .eq("client_id", record.id)
      .eq("info_request_id", infoReq.id)
      .neq("status", "replaced");
    const have = new Set(((docs ?? []) as { label: string }[]).map((d) => d.label.toLowerCase()));
    outstandingDocs = ((infoReq.documents as string[]) ?? []).filter((d) => !have.has(d.toLowerCase()));
  }

  if (outstandingFields.length > 0 || outstandingDocs.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Some of what we asked for is still outstanding.",
        outstanding_fields: outstandingFields.map((f) => ({ key: f, label: fieldLabel(f) })),
        outstanding_documents: outstandingDocs,
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("introducer_info_requests")
    .update({ status: "answered", answered_at: now })
    .eq("id", infoReq.id)
    .eq("status", "open");

  if (error) return NextResponse.json({ ok: false, error: "Could not submit. Please try again." }, { status: 500 });

  // Back to plain "submitted" once nothing is outstanding, so the review queue
  // shows it as ours to action again rather than still waiting on them.
  const { data: stillOpen } = await supabase
    .from("introducer_info_requests")
    .select("id")
    .eq("client_id", record.id)
    .eq("status", "open")
    .limit(1);

  if ((stillOpen ?? []).length === 0 && record.status === "info_requested") {
    await supabase
      .from("introducer_clients")
      .update({ status: "submitted", updated_at: now })
      .eq("id", record.id)
      .eq("status", "info_requested");
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "info_supplied",
    detail: { info_request_id: infoReq.id },
  });

  return NextResponse.json({ ok: true });
}
