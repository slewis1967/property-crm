/**
 * Signed guest links for video calls (server-side only).
 *
 * A broker can hand a client a link to join a call without a CRM login. The
 * link carries a short-lived JWT (signed with the LiveKit API secret) naming
 * the room + guest. The public /join page redeems it at /api/livekit/guest-token
 * for a real LiveKit join token — so the room name is never guessable and the
 * link expires on its own.
 *
 * IMPORTANT: the /join page and /api/livekit/guest-token live under
 * crm.nextkey.com.au, which is behind Cloudflare Access. For external guests to
 * reach them, CF Access needs a **bypass policy** for `/join/*` and
 * `/api/livekit/guest-token`. Until that's added, guests hit the Access login
 * wall. See docs/FEATURE-video-conferencing.md.
 */
import { SignJWT, jwtVerify } from "jose";

const GUEST_SUBJECT = "livekit-guest";

function guestSecret(): Uint8Array | null {
  const s = process.env.LIVEKIT_API_SECRET;
  return s ? new TextEncoder().encode(s) : null;
}

export function guestTokensConfigured(): boolean {
  return guestSecret() !== null;
}

/** Sign a guest link token for a room. Throws if LiveKit isn't configured. */
export async function signGuestToken(opts: {
  room: string;
  name?: string;
  ttlHours?: number;
}): Promise<string> {
  const key = guestSecret();
  if (!key) throw new Error("Guest links are not configured.");
  return new SignJWT({ room: opts.room, name: opts.name ?? "" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(GUEST_SUBJECT)
    .setIssuedAt()
    .setExpirationTime(`${opts.ttlHours ?? 24}h`)
    .sign(key);
}

/** Verify a guest link token. Throws if invalid/expired/not configured. */
export async function verifyGuestToken(
  token: string,
): Promise<{ room: string; name?: string }> {
  const key = guestSecret();
  if (!key) throw new Error("Guest links are not configured.");
  const { payload } = await jwtVerify(token, key, { subject: GUEST_SUBJECT });
  const room = typeof payload.room === "string" ? payload.room : "";
  if (!room) throw new Error("Invalid guest token.");
  const name = typeof payload.name === "string" && payload.name ? payload.name : undefined;
  return { room, name };
}
