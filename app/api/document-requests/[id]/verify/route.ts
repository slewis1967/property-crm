/**
 * POST /api/document-requests/<id>/verify   (AUTHED)
 *
 * The verification agent. Checks an application's collected documents against
 * YLA's standard — structural (PDF, <1MB, not password-locked) + AI visual
 * (legible / correct document / not a screenshot / not rotated). Returns a
 * pass/fail with specific, fixable issues per document. `?visual=0` runs
 * structural only. The gate before packaging + submitting to YLA.
 *
 * The work lives in utils/yla-verification-run.ts (shared with submit-to-yla).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { runApplicationVerification } from "../../../../../utils/yla-verification-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const visual = new URL(req.url).searchParams.get("visual") !== "0";

  const run = await runApplicationVerification(id, { visual });
  if (!run.ok) return NextResponse.json({ ok: false, error: run.error }, { status: run.status });

  return NextResponse.json({
    ok: true,
    application_id: run.applicationId,
    client_ref: run.clientRef,
    visual_checked: run.visualChecked,
    ...run.result,
  });
}
