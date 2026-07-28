/**
 * LiveKit room naming — the pure half of utils/livekit.ts.
 *
 * Separate module because client components need the room name too (to link a
 * staff member at the authed /video/<room> page), and utils/livekit.ts pulls in
 * livekit-server-sdk plus the API secret, which must never reach the browser
 * bundle. Keep this file free of imports.
 */

/** A contact's call room. Scheduled meetings and ad-hoc calls share it, so both
 *  land on the same contact timeline. */
export function roomForContact(contactId: string): string {
  return `contact-${contactId}`;
}
