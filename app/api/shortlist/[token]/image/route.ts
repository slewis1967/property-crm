/**
 * GET /api/shortlist/<token>/image?item=<itemId>&n=<index> — PUBLIC, token-scoped.
 *
 * Streams photo N of a property on this shortlist. It exists so the client
 * never sees a storage URL: those paths carry the brochure folder name, which
 * names the estate and the supplier.
 *
 * Not an open proxy: the URL is looked up server-side from property_media for
 * an item that belongs to the resolved shortlist, and shortlistImageUrls only
 * ever yields our own Supabase public-storage URLs.
 */
import { NextResponse } from "next/server";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { isUuid, SHORTLIST_MAX_IMAGES } from "../../../../../utils/property-shortlist";
import { imageUrlForItem, resolveShortlistToken } from "../../../../../utils/property-shortlist-db";
import { clientIp } from "../../../portal/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Generous: a page of 12 properties can ask for ~100 photos on open.
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 240, keyFn: () => clientIp(req) });
  if (limited) return limited;

  const { token } = await params;
  const url = new URL(req.url);
  const itemId = url.searchParams.get("item");
  const n = Number(url.searchParams.get("n"));
  if (!isUuid(itemId) || !Number.isInteger(n) || n < 0 || n >= SHORTLIST_MAX_IMAGES) {
    return new NextResponse(null, { status: 404 });
  }

  const resolved = await resolveShortlistToken(token);
  if (!resolved.ok) return new NextResponse(null, { status: 404 });

  const source = await imageUrlForItem(resolved.row, itemId, n);
  if (!source) return new NextResponse(null, { status: 404 });

  try {
    const upstream = await fetch(source, { signal: AbortSignal.timeout(10_000) });
    const type = upstream.headers.get("content-type") ?? "";
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (!upstream.ok || !type.startsWith("image/") || length > MAX_BYTES || !upstream.body) {
      return new NextResponse(null, { status: 404 });
    }
    return new NextResponse(upstream.body, {
      headers: {
        "content-type": type,
        // Private: the response is only reachable with the token.
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
