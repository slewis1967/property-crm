/**
 * POST /api/portal/<token>/confirm   { document_id, ok }
 *
 * PUBLIC. Called by the browser after the direct-to-storage PUT resolves.
 *
 * The upload-url route pre-inserts the row so the UI can show a chip
 * immediately, which means a failed PUT would otherwise leave a row that looks
 * like a delivered document — and the whole point of this portal is that the
 * rep can trust the completeness count. So the client tells us how the PUT went:
 * success promotes the row to 'accepted', failure drops it back to 'replaced'
 * (soft-deleted, retained for audit) so the slot reads as outstanding again.
 *
 * A caller could lie, but only about their own request's documents — the worst
 * outcome is their own set being marked incomplete, which the rep sees.
 */
import { NextResponse } from "next/server";
import { resolveToken } from "../../_shared";
import { confirmClientDocumentUpload } from "../../../../../utils/client-document-upload";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  const body = await req.json().catch(() => ({}));

  const res = await confirmClientDocumentUpload({
    requestId: resolved.request.id,
    documentId: body?.document_id,
    succeeded: body?.ok !== false,
  });
  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
