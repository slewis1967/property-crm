/**
 * POST /api/document-requests/<id>/dismiss-issue   (AUTHED)
 *   Body: { document_id }
 *
 * The rep's answer to a verdict they've looked at and disagree with. The YLA
 * check is an AI reading of a PDF: it calls a legible payslip a screenshot and
 * a scanned licence rotated often enough that one disputed file could hold an
 * entire household, with nothing a human could do about it (NK-10017).
 *
 * Dismissing is per FILE, not per application, so clearing one objection never
 * waves through a file nobody has opened. The dismissal is stamped on the
 * document row, which is what makes it durable: a later re-verification —
 * triggered when the co-applicant uploads something — honours it instead of
 * raising the same objection again. A REPLACEMENT upload is a new row and
 * arrives unjudged, as it must.
 *
 * Application-level blockers (an unsigned Needs Analysis) carry no document and
 * cannot be dismissed here: those are ours to produce, not ours to wave past.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../utils/document-requests-db";
import { recomputeVerdictAfterOverride } from "../../../../../utils/yla-override-apply";
import { columnMissing } from "../../../../../utils/column-missing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const documentId = typeof body.document_id === "string" ? body.document_id : null;
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "document_id required" }, { status: 400 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("client_documents")
    .select("id,request_id,filename,status")
    .eq("id", documentId)
    .eq("request_id", id) // scoping: a request can only reach its own documents
    .neq("status", "replaced")
    .maybeSingle();
  if (docErr) return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,status,yla_submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (request.status === "submitted" || request.yla_submitted_at) {
    return NextResponse.json(
      { ok: false, error: "This application has already gone to YLA." },
      { status: 409 },
    );
  }

  const now = new Date();
  const { error: updErr } = await supabase
    .from("client_documents")
    .update({ check_override_by: auth, check_override_at: now.toISOString() })
    .eq("id", documentId)
    .eq("request_id", id);
  if (updErr) {
    // Nothing to degrade to: a dismissal that isn't recorded would be undone by
    // the next re-verification, so say what's missing instead of half-doing it.
    if (columnMissing(updErr, ["check_override_by", "check_override_at"])) {
      return NextResponse.json(
        { ok: false, error: "Run migrations/20260917_document_check_override.sql — dismissals have nowhere to be recorded yet." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
  }

  const outcome = await recomputeVerdictAfterOverride(id, { now });

  return NextResponse.json({
    ok: true,
    dismissed: doc.filename,
    verification_status: outcome.verification_status,
    remaining: outcome.remaining.length,
    complete: outcome.complete,
  });
}
