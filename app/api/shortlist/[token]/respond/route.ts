/**
 * POST /api/shortlist/<token>/respond — PUBLIC, token-scoped.
 * Body: { itemId, response: "interested" | "not_for_me" | null, note? }
 *
 * The item is updated only where it belongs to the resolved shortlist, the
 * response is written to the append-only event log, and the consultant is told.
 * The CSRF origin check in proxy.ts still applies (same-origin from the page).
 */
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { publicOrigin } from "../../../../../utils/document-requests-db";
import { parseResponseInput } from "../../../../../utils/property-shortlist";
import { recordResponse, resolveShortlistToken } from "../../../../../utils/property-shortlist-db";
import { clientIp } from "../../../portal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = clientIp(req);
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 30, keyFn: () => ip });
  if (limited) return limited;

  const { token } = await params;
  const resolved = await resolveShortlistToken(token);
  if (!resolved.ok) return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });

  const parsed = parseResponseInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const result = await recordResponse(resolved.row, parsed.value, { ip, origin: publicOrigin(req) });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, respondedAt: result.respondedAt });
}
