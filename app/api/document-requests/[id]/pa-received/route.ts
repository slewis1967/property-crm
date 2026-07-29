/**
 * Mark the Preliminary Assessment as returned from Your Loan Assist (AUTHED —
 * behind Cloudflare Access, deliberately NOT under the CF-Access-bypassed
 * /api/portal/* namespace).
 *
 *   POST   /api/document-requests/<id>/pa-received   → PA is back
 *   DELETE /api/document-requests/<id>/pa-received   → mark it not back after all
 *
 * The CRM already stamps the PA going OUT (yla_submitted_at) but had no notion
 * of it coming back. That return is the point at which the client's structure is
 * settled, and it gates the director ID walkthrough: only once the PA is in do
 * we know the fund will have a corporate trustee and that a director ID is a
 * correct instruction for this client.
 *
 * Clearing this re-hides the walkthrough immediately (the portal gate requires
 * both this and the rep's release), which is the safe direction.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
  docColumnMissing,
} from "../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Run migrations/20260729_pa_received.sql — the PA-received columns are missing.";

async function setReceived(req: Request, id: string, received: boolean) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 30 });
  if (limited) return limited;

  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({
      pa_received_at: received ? new Date().toISOString() : null,
      pa_received_by: received ? auth : null,
    })
    .eq("id", id)
    .select("id,pa_received_at,pa_received_by,training_video_released_at")
    .maybeSingle();

  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    if (docColumnMissing(error)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });

  return NextResponse.json({ ok: true, request: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return setReceived(req, id, true);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return setReceived(req, id, false);
}
