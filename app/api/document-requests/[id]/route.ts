/**
 * AUTHED per-request detail + management.
 *
 *   GET /api/document-requests/<id>
 *     Full status for the rep: which slots are filled, which outstanding, and
 *     the check notes on each uploaded file. This is the "can I submit to YLA
 *     yet?" view.
 *
 *   PATCH /api/document-requests/<id>   { status: 'cancelled' }
 *     Cancel a request (invalidates the client's link). Only 'cancelled' is
 *     accepted here — 'submitted' is set by the Drive-export step, not by hand.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { requiredSlots } from "../../../../utils/yla-documents";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
  REQUEST_LIST_COLUMNS,
} from "../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: request, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(REQUEST_LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!request) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data: docs } = await supabase
    .from("client_documents")
    .select("id,doc_type,filename,status,check_notes,size_bytes,uploaded_at")
    .eq("request_id", id)
    .neq("status", "replaced")
    .order("uploaded_at", { ascending: true });

  const slots = requiredSlots();
  const used = new Set<string>();
  const filled = slots.map((slot) => {
    const match = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
    if (match) used.add(match.id);
    return { ...slot, document: match ?? null };
  });
  const outstanding = filled.filter((s) => !s.document).length;

  return NextResponse.json({
    ok: true,
    request,
    slots: filled,
    outstanding,
    complete: outstanding === 0,
    received: slots.length - outstanding,
    total: slots.length,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (body.status !== "cancelled") {
    return NextResponse.json(
      { ok: false, error: "Only status:'cancelled' can be set here." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
