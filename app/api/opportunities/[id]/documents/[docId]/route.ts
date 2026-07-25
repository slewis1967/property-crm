/**
 * GET /api/opportunities/<id>/documents/<docId>   (AUTHED)
 *
 * Streams a client-uploaded supporting document back to the advisor by minting a
 * short-lived signed URL for it and redirecting. Access is scoped to the
 * opportunity: the document must belong to a non-cancelled document_request
 * whose opportunity_id matches <id>, so one opportunity's link can never reach
 * another's files.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireAuth } from "../../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id, docId } = await params;

  // The document and the request it belongs to.
  const { data: doc, error: docErr } = await supabase
    .from("client_documents")
    .select("id,request_id,storage_path,original_name,filename,status")
    .eq("id", docId)
    .maybeSingle();
  if (docErr) return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
  if (!doc || !doc.storage_path) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  // Authorisation: the request must be tied to THIS opportunity and not cancelled.
  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,opportunity_id,status")
    .eq("id", doc.request_id)
    .maybeSingle();
  if (!request || request.opportunity_id !== id || request.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const downloadName = (doc.original_name as string) || (doc.filename as string) || "document.pdf";
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path as string, 60, { download: downloadName });
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signErr?.message || "Could not read the document" },
      { status: 502 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
