/**
 * POST /api/opportunities/<id>/documents/confirm   (AUTHED)
 *   Body: { request_id, document_id, ok }
 *
 * The advisor half of the confirm step — called after the direct-to-storage PUT
 * resolves, exactly like the client portal's. upload-url pre-inserts the row so
 * the panel can show the file immediately, which means a failed PUT would leave
 * a row that looks like a delivered document; this promotes it to 'accepted' or
 * rolls it back to 'replaced'.
 *
 * Scoped to the opportunity, same as upload-url.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireAuth } from "../../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../../utils/document-requests-db";
import { confirmClientDocumentUpload } from "../../../../../../utils/client-document-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const advisorEmail = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const requestId = typeof body?.request_id === "string" ? body.request_id : "";
  if (!requestId) {
    return NextResponse.json({ ok: false, error: "request_id required" }, { status: 400 });
  }

  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,opportunity_id,status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request || request.opportunity_id !== id || request.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const res = await confirmClientDocumentUpload({
    requestId,
    documentId: body?.document_id,
    succeeded: body?.ok !== false,
    // Keep the provenance note through the promotion — otherwise a document the
    // client never handled would look identical to one they uploaded.
    keepNote: `Uploaded on the client's behalf by ${advisorEmail || "an advisor"}`,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
