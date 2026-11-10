/**
 * POST /api/document-requests/yla-sweep   (AUTHED)
 *
 * Runs the YLA auto-submit sweep on demand (for testing + a future "run now"
 * button). The schedule runs it automatically; this is the manual trigger.
 * Sends only when YLA_AUTOSUBMIT_ENABLED==="true"; ?dry_run=1 forces a dry run.
 *
 * Static "yla-sweep" segment resolves ahead of the sibling dynamic [id] route.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { runYlaAutoSubmit, ylaAutoSubmitEnabled } from "../../../../utils/yla-auto-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const forceDry = new URL(req.url).searchParams.get("dry_run") === "1";
  const result = await runYlaAutoSubmit({ dryRun: forceDry ? true : !ylaAutoSubmitEnabled() });
  return NextResponse.json(result);
}
