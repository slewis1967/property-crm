/**
 * GET /api/admin/introducers/submissions/<id>/documents/<docId>
 *
 * STAFF. Mints a short-lived signed URL for a document an introducer supplied.
 * The bucket is private and has no RLS policies, so this route holding the
 * service-role key is the only way to read one — matching the client-documents
 * posture exactly.
 *
 * The document id is re-checked against the referral in the path, so a valid id
 * from another referral can't be fetched through this one.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../../../utils/supabase";
import { requireStaff } from "../../../../_shared";
import { logIntroducerEvent } from "../../../../../../introducer/_shared";
import { isSuperAdmin } from "../../../../../../../../utils/super-admin";

export const dynamic = "force-dynamic";

const BUCKET = "introducer-documents";
const URL_TTL_SECONDS = 300;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id, docId } = await params;

  const { data: doc } = await supabase
    .from("introducer_documents")
    .select("id,client_id,label,filename,storage_path")
    .eq("id", docId)
    .eq("client_id", id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, URL_TTL_SECONDS, { download: doc.filename });

  if (error || !signed) {
    return NextResponse.json({ ok: false, error: "Could not open that document." }, { status: 500 });
  }

  // Access to third-party PII is worth a line in the trail, not just the write.
  await logIntroducerEvent({
    clientId: id,
    actorType: isSuperAdmin(auth) ? "super_admin" : "staff",
    actor: auth,
    action: "document_viewed",
    detail: { document_id: docId, label: doc.label },
  });

  return NextResponse.json({ ok: true, url: signed.signedUrl, filename: doc.filename });
}
