/**
 * POST /api/opportunities/<id>/documents/upload-url   (AUTHED)
 *   Body: { request_id, doc_key, slot, size, mime_type?, original_name? }
 *
 * The advisor uploading a client's document ON THEIR BEHALF. Plenty of clients
 * post or email their paperwork in rather than using the portal, and until now
 * there was no way to get those into the application at all — the portal was
 * the only door, so those clients simply stalled.
 *
 * Writes exactly what the portal writes (same helper), so a document that
 * arrived by email is indistinguishable to the verification gate and the Drive
 * export from one the client uploaded — except for the note recording who put
 * it there.
 *
 * Access is scoped to the opportunity: the target request must belong to THIS
 * opportunity and not be cancelled, so one opportunity's page can never write
 * into another's application.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireAuth } from "../../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../../utils/document-requests-db";
import { prepareClientDocumentUpload } from "../../../../../../utils/client-document-upload";

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

  const { data: request, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,applicant_name,client_ref,opportunity_id,status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  // Same opaque 404 for "doesn't exist" and "isn't yours" — the id is a UUID and
  // there's no reason to confirm one exists elsewhere.
  if (!request || request.opportunity_id !== id || request.status === "cancelled") {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const prepared = await prepareClientDocumentUpload(
    {
      id: String(request.id),
      applicant_name: String(request.applicant_name),
      client_ref: (request.client_ref as string) ?? null,
    },
    body,
    advisorEmail || "an advisor",
  );
  if (!prepared.ok) {
    return NextResponse.json({ ok: false, error: prepared.error }, { status: prepared.status });
  }

  return NextResponse.json({
    ok: true,
    token: prepared.token,
    path: prepared.path,
    bucket: prepared.bucket,
    document_id: prepared.document_id,
    filename: prepared.filename,
  });
}
