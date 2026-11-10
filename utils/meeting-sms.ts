/**
 * The text message that goes with a meeting invite.
 *
 * WHY THIS EXISTS. A booking's only notification was one email carrying an .ics
 * attachment. On 25 July an invite to a real client was accepted by Gmail,
 * recorded as delivered, and never opened — almost certainly filed into spam or
 * Promotions, which is what a calendar attachment from a near-unknown sender
 * attracts. She missed a 9am meeting and told us she'd received nothing. A
 * second channel would have caught it, and an SMS is read within minutes.
 *
 * Deliberately short: one message segment where possible, the time and the day
 * first, and no link — links are what make an SMS look like a scam. The email
 * carries the join link; this exists so the client knows to go and find it.
 *
 * Pure: no I/O, so the wording is unit-tested.
 */

/** Brisbane/AEST — the CRM's timezone everywhere. QLD has no DST. */
const AEST_OFFSET_MIN = 10 * 60;

function aest(date: Date): Date {
  return new Date(date.getTime() + AEST_OFFSET_MIN * 60 * 1000);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 29 Jul at 9:00am" — read off the AEST wall clock, not the server's. */
export function formatMeetingWhen(startISO: string): string {
  const d = aest(new Date(startISO));
  const hours24 = d.getUTCHours();
  const mins = d.getUTCMinutes();
  const ampm = hours24 < 12 ? "am" : "pm";
  const h12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const time = mins === 0 ? `${h12}${ampm}` : `${h12}:${String(mins).padStart(2, "0")}${ampm}`;
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} at ${time}`;
}

/**
 * The confirmation body. `firstName` is optional — an unnamed contact still
 * gets a usable message rather than "Hi ," which reads as a broken mailmerge.
 */
export function meetingSmsBody(opts: {
  firstName?: string | null;
  startISO: string;
  hostName: string;
}): string {
  const who = (opts.firstName || "").trim().split(/\s+/)[0] || "";
  const greeting = who ? `Hi ${who}, ` : "";
  return (
    `${greeting}your meeting with ${opts.hostName} is confirmed for ` +
    `${formatMeetingWhen(opts.startISO)}. We've emailed you the joining link — ` +
    `if it's not in your inbox, please check your spam or promotions folder. Reply STOP to opt out.`
  );
}
