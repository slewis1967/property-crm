/**
 * GET /api/shortlist/<token> — PUBLIC (CF Access bypass + proxy.ts
 * isPublicShortlistRoute). The client's masked view of their shortlist.
 *
 * Trust is the token alone: it is re-resolved here, and everything returned is
 * built by loadClientShortlist, which runs the forbidden-key tripwire.
 */
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { clientIp } from "../../portal/_shared";
import { loadClientShortlist, recordView, resolveShortlistToken } from "../../../../utils/property-shortlist-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "private, no-store" };

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 60, keyFn: () => clientIp(req) });
  if (limited) return limited;

  const { token } = await params;
  const resolved = await resolveShortlistToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status, headers: NO_STORE });
  }

  try {
    const shortlist = await loadClientShortlist(resolved.row);
    await recordView(resolved.row).catch(() => undefined);
    return NextResponse.json({ ok: true, shortlist }, { headers: NO_STORE });
  } catch (err) {
    console.error("[shortlist] load failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong loading your properties. Please try again." },
      { status: 500, headers: NO_STORE },
    );
  }
}
