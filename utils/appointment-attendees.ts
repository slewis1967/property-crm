/**
 * Meeting type and attendee list for a CRM appointment.
 *
 * The `appointments` table only has one contact_email, so it can't hold
 * a list of attendees. The table does have a `raw_payload` jsonb column,
 * left over from Cal.com, which CRM bookings never used. A CRM booking
 * now stores { source: "crm", meeting_kind, attendees } there, so a later
 * change or cancellation reaches everyone who was invited, not only the
 * main contact.
 *
 * Pure: no I/O, so it is unit-tested.
 */
import { toE164AU } from "./sms";

export type MeetingKind = "video" | "phone" | "inspection";

export const MEETING_KINDS: readonly MeetingKind[] = ["video", "phone", "inspection"];

export type StoredAttendee = { email: string | null; name: string | null; phone: string | null };

export type AppointmentPayload = {
  source: "crm";
  meeting_kind: MeetingKind;
  attendees: StoredAttendee[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseMeetingKind(v: unknown): MeetingKind {
  return v === "phone" || v === "inspection" ? v : "video";
}

/** Short human label used in SMS and email copy. */
export function meetingKindNoun(kind: MeetingKind | undefined): string {
  return kind === "phone" ? "phone call" : kind === "inspection" ? "on-site inspection" : "meeting";
}

/**
 * Clean up the attendee rows from the form. A row is kept if it has a valid
 * email OR a valid AU mobile, so someone who only has a phone number can still
 * be texted. Each row is deduplicated by email, then by mobile.
 */
export function normaliseAttendees(
  raw: Array<{ email?: unknown; displayName?: unknown; name?: unknown; phone?: unknown }> | undefined,
): StoredAttendee[] {
  if (!Array.isArray(raw)) return [];
  const out: StoredAttendee[] = [];
  const seenEmail = new Set<string>();
  const seenPhone = new Set<string>();
  for (const a of raw) {
    if (!a || typeof a !== "object") continue;
    const emailRaw = typeof a.email === "string" ? a.email.trim() : "";
    const email = EMAIL_RE.test(emailRaw) ? emailRaw : null;
    const nameRaw = typeof a.displayName === "string" ? a.displayName : typeof a.name === "string" ? a.name : "";
    const name = nameRaw.trim() || null;
    const phoneRaw = typeof a.phone === "string" ? a.phone.trim() : "";
    const phone = toE164AU(phoneRaw);
    if (!email && !phone) continue;
    if (email && seenEmail.has(email.toLowerCase())) continue;
    if (!email && phone && seenPhone.has(phone)) continue;
    if (email) seenEmail.add(email.toLowerCase());
    if (phone) seenPhone.add(phone);
    out.push({ email, name, phone });
  }
  return out;
}

/** Who gets an email: every attendee with an email address. */
export function emailRecipients(attendees: StoredAttendee[]): Array<{ email: string; name?: string }> {
  return attendees
    .filter((a): a is StoredAttendee & { email: string } => !!a.email)
    .map((a) => ({ email: a.email, name: a.name ?? undefined }));
}

/**
 * Who gets a text. Every attendee with a mobile number, plus the main
 * contact. The contact's mobile on file covers their own row when the form
 * left it blank. Each number is texted once. `isContact` marks the contact's
 * text so the SMS log links to their record.
 */
export function smsRecipients(
  attendees: StoredAttendee[],
  contact: { email: string | null; name: string | null; phone: string | null } | null,
): Array<{ phone: string; name: string | null; email: string | null; isContact: boolean }> {
  const contactPhone = contact ? toE164AU(contact.phone) : null;
  const contactEmail = contact?.email?.toLowerCase() ?? null;
  const out: Array<{ phone: string; name: string | null; email: string | null; isContact: boolean }> = [];
  const seen = new Set<string>();
  const push = (phone: string | null, name: string | null, email: string | null, isContact: boolean) => {
    if (!phone || seen.has(phone)) return;
    seen.add(phone);
    out.push({ phone, name, email, isContact });
  };
  for (const a of attendees) {
    const isContact = !!contactEmail && a.email?.toLowerCase() === contactEmail;
    push(a.phone ?? (isContact ? contactPhone : null), a.name, a.email, isContact || (!!contactPhone && a.phone === contactPhone));
  }
  if (contact) push(contactPhone, contact.name, contact.email, true);
  return out;
}

export function buildAppointmentPayload(kind: MeetingKind, attendees: StoredAttendee[]): AppointmentPayload {
  return { source: "crm", meeting_kind: kind, attendees };
}

/**
 * Read a stored payload back. Anything that isn't a CRM payload (an old
 * Cal.com row, or null) yields null, and the caller falls back to the
 * row's contact_email.
 */
export function readAppointmentPayload(raw: unknown): AppointmentPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.source !== "crm") return null;
  const attendees = Array.isArray(r.attendees)
    ? (r.attendees as unknown[])
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          email: typeof a.email === "string" && EMAIL_RE.test(a.email) ? a.email : null,
          name: typeof a.name === "string" ? a.name : null,
          phone: typeof a.phone === "string" ? toE164AU(a.phone) : null,
        }))
        .filter((a) => a.email || a.phone)
    : [];
  return { source: "crm", meeting_kind: parseMeetingKind(r.meeting_kind), attendees };
}

/** A Google Maps search link for a street address (shown in the email). */
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
