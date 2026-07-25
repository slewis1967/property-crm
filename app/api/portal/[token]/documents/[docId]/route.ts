/**
 * GET /api/portal/<token>/documents/<docId>[?preview=1]
 *
 * PUBLIC (token-scoped). Lets the CLIENT open a document they supplied — the
 * portal showed a filename and nothing else, so nobody could confirm they'd
 * sent the right file, which is how a wrong upload survives to the assessor.
 *
 * ?preview=1 serves it inline so it opens in a tab; otherwise it downloads.
 *
 * Scoping is the whole security model: the document must belong to THIS token's
 * own request, so a portal link can never reach another applicant's files —
 * including their co-applicant's, whose documents are their own to share.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { resolveToken, clientIp } from "../../../_shared";
import { CLIENT_DOCUMENTS_BUCKET } from "../../../../../../utils/client-document-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; docId: string }> },
) {
  const { token, docId } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 60,
    keyFn: () => `portal-doc:${token}:${clientIp(req)}`,
  });
  if (limited) return limited;

  const inline = new URL(req.url).searchParams.get("preview") === "1";

  const { data: doc } = await supabase
    .from("client_documents")
    .select("id,request_id,storage_path,filename,original_name")
    .eq("id", docId)
    .eq("request_id", resolved.request.id) // ← the scope that matters
    .maybeSingle();
  if (!doc?.storage_path) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const name = (doc.filename as string) || (doc.original_name as string) || "document.pdf";
  const { data: signed, error } = await supabase.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .createSignedUrl(doc.storage_path as string, 60, inline ? undefined : { download: name });
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, error: "Could not open that document." }, { status: 502 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
