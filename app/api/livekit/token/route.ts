import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import {
  mintJoinToken,
  roomForContact,
  livekitBrowserUrl,
  livekitConfigured,
} from "../../../../utils/livekit";

/**
 * Mint a room-scoped LiveKit join token for the authenticated CRM user.
 *
 * Callers:
 *   - StartVideoCallButton (contact / opportunity detail) -> passes contactId
 *   - app/video/[room]/CallClient -> passes an explicit room
 *
 * The participant identity is the Cloudflare-Access email, so a broker is the
 * same identity across every room and shows up by name in the call UI. The
 * token is short-lived (2h) and grants join to exactly one room.
 *
 * Returns 503 (not 500) when LiveKit isn't configured, so the UI can show a
 * clear "video calling isn't set up yet" message instead of a hard error.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const email = auth;

  if (!livekitConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Video calling is not configured on this server." },
      { status: 503 },
    );
  }

  let body: {
    room?: string;
    contactId?: string;
    displayName?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Resolve the room: an explicit room wins, otherwise derive it from the
  // contact so everyone viewing that contact joins the same call.
  const room =
    body.room?.trim() ||
    (body.contactId ? roomForContact(body.contactId.trim()) : "");

  if (!room) {
    return NextResponse.json(
      { ok: false, error: "A room or contactId is required." },
      { status: 400 },
    );
  }

  const token = await mintJoinToken({
    identity: email,
    name: body.displayName?.trim() || email,
    room,
  });

  return NextResponse.json({
    ok: true,
    token,
    url: livekitBrowserUrl(),
    room,
  });
}
