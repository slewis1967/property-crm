/**
 * POST /api/properties/map/geocode   Body: { keys?: string[], limit?: number }
 *
 * Resolve suburb centroids for the Stock Map and cache them in `stock_geocodes`.
 *
 * Called by the map page's "Locate N suburbs" button. It is a one-off per
 * suburb — once cached, a suburb is never geocoded again — so the whole set of
 * ~170 gets filled in a handful of clicks and then never again.
 *
 * Why the batch is small: Nominatim's usage policy is a hard 1 request/second,
 * and Netlify functions time out around 26s. BATCH_LIMIT * 1.1s must stay well
 * inside that, so the client loops rather than the server blocking. For a bulk
 * backfill, run scripts/geocode-stock-suburbs.mjs instead.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { withObservability } from "../../../../../utils/observability";
import { log } from "../../../../../utils/logger";
import { geocodeMissing, type SuburbKey } from "../../../../../utils/geo/suburbs";

export const dynamic = "force-dynamic";

// 12 * ~1.1s ≈ 13s — comfortably inside Netlify's ~26s function ceiling.
const BATCH_LIMIT = 12;

async function handler(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: { keys?: unknown; limit?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const keys = Array.isArray(body.keys)
    ? (body.keys.filter((k) => typeof k === "string" && k.trim()) as SuburbKey[])
    : [];
  if (keys.length === 0) {
    return NextResponse.json({ ok: false, error: "keys[] required" }, { status: 400 });
  }

  const requested = typeof body.limit === "number" ? body.limit : BATCH_LIMIT;
  const limit = Math.max(1, Math.min(BATCH_LIMIT, Math.floor(requested)));

  const { resolved, failed } = await geocodeMissing(keys, limit);
  log.info("stockmap.geocode_batch", {
    requested: keys.length,
    attempted: Math.min(keys.length, limit),
    resolved: resolved.length,
    failed: failed.length,
  });

  return NextResponse.json({
    ok: true,
    resolved,
    failed,
    // Keys the caller asked for that this batch didn't get to — the client
    // uses this to decide whether to call again.
    remaining: keys.slice(limit),
  });
}

export const POST = withObservability("POST /api/properties/map/geocode", handler);
