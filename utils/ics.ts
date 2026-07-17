/**
 * Minimal iCalendar (.ics) builder — pure, no deps, server-or-browser safe.
 *
 * We attach one of these to the Brevo meeting invite (utils/meeting-invite.ts)
 * so the booking lands in whatever calendar the recipient actually uses
 * (Outlook, Apple, Proton, phone) — no Google account anywhere. This is the
 * piece that replaces what Google Calendar's own invite email used to do.
 *
 * Scope is deliberately small: a single VEVENT wrapped in a METHOD:REQUEST
 * VCALENDAR (REQUEST = "please add this to your calendar", which is what a
 * meeting invite is). Times are emitted in UTC (…Z) so there's no VTIMEZONE to
 * carry. RFC 5545 text escaping + 75-octet line folding are implemented because
 * strict clients (Outlook) will silently drop an event with an unescaped comma
 * or an over-long line.
 */

export interface IcsEvent {
  /** Globally-unique id for the event. Reuse it to update/cancel later. */
  uid: string;
  /** Event start (any Date-parseable ISO string or Date). */
  start: string | Date;
  /** Event end. */
  end: string | Date;
  title: string;
  description?: string;
  /** Physical location OR a URL (we pass the LiveKit join link here). */
  location?: string;
  /** URL surfaced in the client's "join" affordance (X-… + URL prop). */
  url?: string;
  organizer?: { name?: string; email: string };
  attendees?: { name?: string; email: string }[];
  /** REQUEST (invite, default) or CANCEL (withdraw a previously-sent invite). */
  method?: "REQUEST" | "CANCEL";
  /** Bump on each re-send of the same UID so clients accept the update. */
  sequence?: number;
  /** Overrides "now" for DTSTAMP — only used to make tests deterministic. */
  dtstamp?: string | Date;
}

/** RFC 5545 §3.3.11 text escaping: backslash, semicolon, comma, newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC basic-format timestamp: 20260718T041500Z. */
function toIcsUtc(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`ics: invalid date "${String(value)}"`);
  }
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Fold a content line to 75 octets per RFC 5545 §3.1. Continuation lines start
 * with a single space. We fold on octet (byte) boundaries, not code points, so
 * a multi-byte UTF-8 char is never split across a fold.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const chunks: Buffer[] = [];
  let offset = 0;
  // First line 75 octets; continuation lines 74 (the leading space counts).
  let limit = 75;
  while (offset < bytes.length) {
    let take = Math.min(limit, bytes.length - offset);
    // Don't cut a UTF-8 continuation byte (10xxxxxx) — back off until we're at
    // a lead byte so decoding stays valid.
    while (take > 1 && (bytes[offset + take] & 0xc0) === 0x80) take--;
    chunks.push(bytes.subarray(offset, offset + take));
    offset += take;
    limit = 74;
  }
  return chunks.map((c, i) => (i === 0 ? "" : " ") + c.toString("utf8")).join("\r\n");
}

/** Build the full .ics document text (CRLF line endings, as clients expect). */
export function buildIcs(ev: IcsEvent): string {
  const method = ev.method ?? "REQUEST";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NextKey CRM//Meeting//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(ev.uid)}`,
    `DTSTAMP:${toIcsUtc(ev.dtstamp ?? new Date())}`,
    `DTSTART:${toIcsUtc(ev.start)}`,
    `DTEND:${toIcsUtc(ev.end)}`,
    `SEQUENCE:${ev.sequence ?? 0}`,
    `SUMMARY:${escapeText(ev.title)}`,
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
  ];

  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.url) {
    lines.push(`URL:${escapeText(ev.url)}`);
    // Widely-honoured hint that puts a clickable join link in Outlook/Teams.
    lines.push(`X-MICROSOFT-SKYPETEAMSMEETINGURL:${escapeText(ev.url)}`);
  }
  if (ev.organizer) {
    const cn = ev.organizer.name ? `;CN=${escapeText(ev.organizer.name)}` : "";
    lines.push(`ORGANIZER${cn}:mailto:${ev.organizer.email}`);
  }
  for (const a of ev.attendees ?? []) {
    const cn = a.name ? `;CN=${escapeText(a.name)}` : "";
    lines.push(
      `ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    );
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Base64 of the .ics document — the shape Brevo wants for a raw attachment. */
export function icsBase64(ev: IcsEvent): string {
  return Buffer.from(buildIcs(ev), "utf8").toString("base64");
}
