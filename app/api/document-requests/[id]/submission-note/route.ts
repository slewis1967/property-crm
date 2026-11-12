/**
 * GET/PUT /api/document-requests/<id>/submission-note   (AUTHED)
 *
 * The advisor's note to YLA for this application — see
 * utils/yla-submission-note.ts for where it goes. Editable until the
 * application has been sent to YLA; after that it is what YLA received, so it
 * is read-only here.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../utils/document-requests-db";
import { SUBMISSION_NOTE_MAX } from "../../../../../utils/yla-submission-note";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT = "Run migrations/20261112_submission_note.sql to enable submission notes.";
const missingColumn = (msg?: string) => !!msg && /submission_note/.test(msg);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,submission_note,yla_submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (missingColumn(error.message)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    note: (data as { submission_note?: string | null }).submission_note ?? "",
    locked: !!(data as { yla_submitted_at?: string | null }).yla_submitted_at,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  if (typeof body.note !== "string") {
    return NextResponse.json({ ok: false, error: "note must be a string" }, { status: 400 });
  }
  const note = body.note.trim();
  if (note.length > SUBMISSION_NOTE_MAX) {
    return NextResponse.json({ ok: false, error: `Keep the note under ${SUBMISSION_NOTE_MAX} characters.` }, { status: 400 });
  }

  const { data: row, error: readErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,yla_submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if ((row as { yla_submitted_at?: string | null }).yla_submitted_at) {
    return NextResponse.json({ ok: false, error: "Already sent to YLA — the note can no longer be changed." }, { status: 409 });
  }

  const { error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({ submission_note: note || null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    if (missingColumn(error.message)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, note });
}
