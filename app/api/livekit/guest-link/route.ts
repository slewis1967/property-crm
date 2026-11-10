import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { roomForContact, livekitConfigured } from "../../../../utils/livekit";
import { signGuestToken } from "../../../../utils/guest-token";
import { guestJoinOrigin } from "../../../../utils/springboard-book-host";

/**
 * Generate a shareable guest link for a call (broker action, authed).
 *
 * POST { contactId? | room?, guestName?, ttlHours?, brand? } -> { ok, url, room }
 *
 * brand "springboard" puts the link on book.springboardhomes.com.au, so a
 * Springboard lead never sees a nextkey.com.au address; anything else keeps
 * the CRM origin.
 *
 * The returned URL points at the public /join/<token> page; the token is a
 * signed, expiring JWT naming the room + guest. Send it to a client so they can
 * join without a CRM login (subject to the CF Access bypass — see guest-token.ts).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  if (!livekitConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Video calling is not configured on this server." },
      { status: 503 },
    );
  }

  let body: {
    contactId?: string;
    room?: string;
    guestName?: string;
    ttlHours?: number;
    brand?: string;
  };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const room =
    body.room?.trim() ||
    (body.contactId ? roomForContact(body.contactId.trim()) : "");
  if (!room) {
    return NextResponse.json(
      { ok: false, error: "A room or contactId is required." },
      { status: 400 },
    );
  }

  const token = await signGuestToken({
    room,
    name: body.guestName?.trim(),
    ttlHours: body.ttlHours,
  });

  const brand = body.brand === "springboard" ? "springboard" : "nextkey";
  const url = `${guestJoinOrigin(brand, req.nextUrl.origin, false)}/join/${encodeURIComponent(token)}`;
  return NextResponse.json({ ok: true, url, room });
}
