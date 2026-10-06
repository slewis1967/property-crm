/**
 * Preliminary Assessment — in-call presentation helpers (pure).
 *
 * The small decisions the call screens and the guest routes share: which
 * contact a room belongs to, who is allowed to drive the presentation, and what
 * an applicant should be looking at. Kept free of server and browser imports so
 * the "use client" overlays, the route handlers and vitest can all load it.
 */
import { roomForContact } from "./livekit-rooms";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * The contact a call room belongs to, or null for any room that is not exactly
 * `contact-<uuid>`. Round-trips through roomForContact rather than slicing a
 * prefix, so the two can never drift: a room this returns an id for is by
 * construction the room that id maps back to.
 */
export function contactIdFromRoom(room: unknown): string | null {
  if (typeof room !== "string") return null;
  const id = room.startsWith("contact-") ? room.slice("contact-".length) : "";
  if (!isUuid(id)) return null;
  const canonical = id.toLowerCase();
  // A room spelt with an upper-case id is a different LiveKit room from the one
  // staff are in, so it must not resolve to the same contact.
  return roomForContact(canonical) === room ? canonical : null;
}

/**
 * May this participant drive the presentation?
 *
 * LiveKit identities are assigned by OUR token routes, never by the browser:
 * guests always get `guest:<name>#<suffix>` (app/api/livekit/guest-token) and
 * staff get their Cloudflare Access email. Guests hold canPublishData (chat
 * needs it), so the topic alone proves nothing. This check is the only thing
 * stopping one applicant putting a "watch the video" screen on the other's
 * phone. No identity at all (a server-sent or stripped packet) is refused too.
 */
export function isPresenterIdentity(identity: string | null | undefined): boolean {
  if (typeof identity !== "string") return false;
  const id = identity.trim();
  if (!id) return false;
  return !id.toLowerCase().startsWith("guest:");
}

export type GuestPaStage = "pa" | "video" | "sent";

/**
 * What the applicants should be looking at, from the row alone. Ordered from
 * the furthest step back, because each later timestamp implies the earlier
 * ones and a re-presented PA keeps its old stamps.
 */
export function guestPaStage(row: {
  video_shown_at?: string | null;
  signing_sent_at?: string | null;
}): GuestPaStage {
  if (row.signing_sent_at) return "sent";
  if (row.video_shown_at) return "video";
  return "pa";
}

/** Keep a requested page inside the document (1-based). */
export function clampPage(page: number, pageCount: number): number {
  const max = Number.isFinite(pageCount) && pageCount >= 1 ? Math.floor(pageCount) : 1;
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.floor(page)), max);
}

/**
 * `video_confirmed_by` for an applicant's own confirmation. The name comes out
 * of the signed guest token, but a rep typed it into a link form, so it is
 * flattened and capped before it lands in a column staff read.
 */
export function guestConfirmedBy(name: string | null | undefined): string {
  const clean = (name ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `guest:${clean || "Guest"}`;
}

/**
 * Rate-limit key for the guest PA endpoints: client IP plus the TAIL of the
 * token. The signing routes key on a token prefix, which works for their random
 * tokens; a guest token is a JWT, and every JWT signed with the same algorithm
 * starts with the same header bytes, so a prefix would put every call in the
 * building into one bucket. The tail is the signature, which differs per link.
 */
export function guestRateKey(ip: string, token: string): string {
  const tail = typeof token === "string" ? token.slice(-12) : "none";
  return `${ip || "unknown"}:${tail || "none"}`;
}

/** "Sent for signing to 2 applicants" — the rep's confirmation line. */
export function sentForSigningLabel(count: number, alreadySent = false): string {
  const who = count === 1 ? "1 applicant" : `${count} applicants`;
  const base = count > 0 ? `Sent for signing to ${who}` : "Sent for signing";
  return alreadySent ? `${base} (already sent earlier)` : base;
}
