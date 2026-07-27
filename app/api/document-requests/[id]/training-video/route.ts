/**
 * Rep-side release control for the director ID walkthrough (AUTHED — behind
 * Cloudflare Access, deliberately NOT under the CF-Access-bypassed /api/portal/*).
 *
 *   POST   /api/document-requests/<id>/training-video   → release to the client
 *   DELETE /api/document-requests/<id>/training-video   → withdraw it again
 *
 * The video is only correct for a client whose SMSF will have a CORPORATE
 * trustee. A client with individual trustees has no director ID obligation at
 * all, so this is opt-in per client rather than shown to everyone.
 *
 * Releasing records WHO released it, so there is an audit trail for a document
 * that tells a client to go and obtain a government identifier.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
} from "../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Run migrations/20260727_portal_training_video.sql — the release columns are missing.";

/** A missing COLUMN reports 42703, distinct from the 42P01 missing-table case. */
function columnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

async function setReleased(req: Request, id: string, release: boolean) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 30 });
  if (limited) return limited;

  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const { data, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({
      training_video_released_at: release ? new Date().toISOString() : null,
      training_video_released_by: release ? auth : null,
    })
    .eq("id", id)
    .select("id,training_video_released_at,training_video_released_by")
    .maybeSingle();

  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    if (columnMissing(error)) {
      return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ ok: false, error: "Request not found" }, { status: 404 });

  return NextResponse.json({ ok: true, request: data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return setReleased(req, id, true);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return setReleased(req, id, false);
}
