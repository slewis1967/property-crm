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
  // UNIQUE identity per redemption, NOT per guest name. LiveKit treats identity
  // as the primary key of a participant in a room: a second connection with the
  // same identity evicts the first with DUPLICATE_IDENTITY. One guest link is
  // routinely opened by more than one person — the broker clicks the same link
  // out of the calendar entry the client got, or two applicants join from
  // separate devices — and with a shared `guest:<name>` identity they knocked
  // each other out of the call, in turns, indefinitely. That is exactly what
  // happened on a live client call on 2026-07-28.
  //
  // The display name stays the name on the link, so the call UI is unchanged;
  // only the internal identity gains a random suffix.
  const token = await mintJoinToken({
    identity: `guest:${guestName}#${crypto.randomUUID().slice(0, 8)}`,
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
