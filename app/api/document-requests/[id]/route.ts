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
import { requiredSlots, allowsExtra, DOC_BY_KEY } from "../../../../utils/yla-documents";
import { columnMissing } from "../../../../utils/column-missing";
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

  // The override columns arrive with 20260917_document_check_override.sql. Code
  // ships before the SQL is run here, and a request's documents are the whole
  // point of this screen — so lose the dismissal stamps rather than the list.
  const DOC_COLUMNS = "id,doc_type,filename,status,check_notes,size_bytes,uploaded_at";
  type DocRow = {
    id: string;
    doc_type: string;
    filename: string;
    status: string;
    check_notes: string | null;
    size_bytes: number | null;
    uploaded_at: string;
    check_override_by?: string | null;
    check_override_at?: string | null;
  };
  const docQuery = async (columns: string) => {
    const { data, error } = await supabase
      .from("client_documents")
      .select(columns)
      .eq("request_id", id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });
    return { data: data as unknown as DocRow[] | null, error };
  };

  const withOverrides = await docQuery(`${DOC_COLUMNS},check_override_by,check_override_at`);
  const docs = columnMissing(withOverrides.error, ["check_override_by", "check_override_at"])
    ? (await docQuery(DOC_COLUMNS)).data
    : withOverrides.data;

  const slots = requiredSlots();
  const used = new Set<string>();
  const filled = slots.map((slot) => {
    const match = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
    if (match) used.add(match.id);
    return { ...slot, document: match ?? null };
  });
  const outstanding = filled.filter((s) => !s.document).length;

  // Documents BEYOND the required slots — a third or fourth ATO statement,
  // because myGov issues one per employer. They were invisible here while the
  // verification agent was checking them, so a rep could be told an extra file
  // had failed and have no way to see or remove it. They do NOT count towards
  // received/total: the set is complete when the required slots are filled.
  const extras = (docs ?? [])
    .filter((d) => !used.has(d.id) && allowsExtra(d.doc_type))
    .map((d, i) => ({
      docKey: d.doc_type,
      label: DOC_BY_KEY[d.doc_type]?.label ?? d.doc_type,
      hint: "",
      slot: filled.filter((s) => s.docKey === d.doc_type).length + i + 1,
      extra: true,
      document: d,
    }));

  return NextResponse.json({
    ok: true,
    request,
    slots: [...filled, ...extras],
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
