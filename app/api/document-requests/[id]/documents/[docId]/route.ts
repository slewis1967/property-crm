/**
 * DELETE /api/document-requests/<id>/documents/<docId>   (AUTHED)
 *
 * Removes a document a client should never have sent — a super statement
 * uploaded into an ATO slot, a licence photo of someone else, a file the client
 * asks us to destroy. There was no way to do this: the client's portal only
 * replaces a slot by uploading over it, so a wrong file stayed in the set, in
 * the Drive package and in the AI check's verdict.
 *
 * The bytes go. This is sensitive personal information (payslips, photo ID,
 * super statements) and keeping a copy nobody wants is the kind of thing the
 * Privacy Act's retention principle exists for. The ROW stays, marked
 * 'replaced' — which every read path already filters out — carrying a note of
 * who removed it and when, so the set's history survives the file.
 *
 * The slot reopens: the client's existing link accepts a replacement, and the
 * application's verdict is re-decided without the objection this file carried.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireAuth } from "../../../../../../utils/cf-access";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../../utils/document-requests-db";
import { CLIENT_DOCUMENTS_BUCKET } from "../../../../../../utils/client-document-upload";
import { recomputeVerdictAfterOverride } from "../../../../../../utils/yla-override-apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id, docId } = await params;

  const { data: doc, error: docErr } = await supabase
    .from("client_documents")
    .select("id,request_id,filename,storage_path,status")
    .eq("id", docId)
    .eq("request_id", id) // scoping: a request can only reach its own documents
    .maybeSingle();
  if (docErr) return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
  if (!doc) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,applicant_name,status,yla_submitted_at")
    .eq("id", id)
    .maybeSingle();
  if (!request) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Once it is with YLA, deleting our copy changes nothing they hold and
  // leaves our record disagreeing with what was actually assessed.
  if (request.status === "submitted" || request.yla_submitted_at) {
    return NextResponse.json(
      { ok: false, error: "This application has already gone to YLA. Its documents can no longer be removed." },
      { status: 409 },
    );
  }

  // Storage first: a failure here must not leave a row that says the file is
  // gone while the bytes are still sitting in the bucket.
  if (doc.storage_path) {
    const { error: rmErr } = await supabase.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .remove([doc.storage_path as string]);
    if (rmErr) {
      return NextResponse.json({ ok: false, error: "Could not delete the file from storage." }, { status: 502 });
    }
  }

  const when = new Date();
  const { error: updErr } = await supabase
    .from("client_documents")
    .update({
      status: "replaced",
      check_notes: `Deleted by ${auth} on ${when.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}`,
    })
    .eq("id", docId)
    .eq("request_id", id);
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });

  const outcome = await recomputeVerdictAfterOverride(id, {
    removed: [{ filename: doc.filename as string, applicantName: request.applicant_name as string }],
    now: when,
  });

  return NextResponse.json({
    ok: true,
    deleted: doc.filename,
    verification_status: outcome.verification_status,
    remaining: outcome.remaining.length,
  });
}
