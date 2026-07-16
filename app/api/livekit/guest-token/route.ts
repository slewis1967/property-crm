import { NextRequest, NextResponse } from "next/server";
import {
  mintJoinToken,
  livekitBrowserUrl,
  livekitConfigured,
} from "../../../../utils/livekit";
import { verifyGuestToken } from "../../../../utils/guest-token";

/**
 * Redeem a signed guest link token for a real LiveKit join token.
 *
 * POST { t: <guest-link-token> } -> { ok, token, url, room, name }
 *
 * PUBLIC (no requireAuth) — this is how external clients join. Trust comes from
 * the signed guest token (verified against the LiveKit API secret), which names
 * the room and expires on its own. A guest can publish + subscribe but cannot
 * record (that route stays behind requireAuth).
 *
 * NOTE: for guests to reach this at all, Cloudflare Access must have a bypass
 * policy for `/api/livekit/guest-token` (and `/join/*`). See guest-token.ts.
 */
export async function POST(req: NextRequest) {
  if (!livekitConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Video calling is not configured on this server." },
      { status: 503 },
    );
  }

  let body: { t?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const guestToken = body.t?.trim();
  if (!guestToken) {
    return NextResponse.json(
      { ok: false, error: "Missing guest token." },
      { status: 400 },
    );
  }

  let claims: { room: string; name?: string };
  try {
    claims = await verifyGuestToken(guestToken);
  } catch {
    return NextResponse.json(
      { ok: false, error: "This guest link is invalid or has expired." },
      { status: 401 },
    );
  }

  const guestName = claims.name || "Guest";
  // Stable-ish identity per guest name so they show up named in the call.
  const token = await mintJoinToken({
    identity: `guest:${guestName}`,
    name: guestName,
    room: claims.room,
    canPublish: true,
  });

  return NextResponse.json({
    ok: true,
    token,
    url: livekitBrowserUrl(),
    room: claims.room,
    name: guestName,
  });
}
