import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/**
 * POST /api/prospecting/resolve  Body: { lat, lng }
 *
 * Reverse-geocodes a candidate's centroid to a street address (server-side, so
 * it isn't blocked by the browser CSP). Called on demand when the user picks a
 * candidate to feaso — not for every row in the scan.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { lat, lng } = (await req.json()) as { lat?: number; lng?: number };
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ ok: false, error: "lat/lng required" }, { status: 400 });
    }
    const url =
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
      `&format=json&addressdetails=1&zoom=18`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let address = "";
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": "NextKey-CRM-Prospecting/1.0 (sean.l@nextkey.com.au)" },
      });
      if (res.ok) {
        const j = (await res.json()) as { display_name?: string };
        address = j?.display_name ?? "";
      }
    } finally {
      clearTimeout(t);
    }

    return NextResponse.json({ ok: true, address });
  } catch (e) {
    log.error("prospecting_resolve.failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Resolve failed" },
      { status: 500 },
    );
  }
}
