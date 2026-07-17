/**
 * The canonical list of people a meeting can be hosted by (the "meeting owner"
 * in the scheduler). `email` is the key: /api/appointments uses it to label the
 * booking and `brand` to pick the Brevo sending identity for the invite email.
 * There's no external calendar to connect — the CRM `appointments` table is the
 * calendar, so every host is bookable immediately.
 */

export type Brand = "nextkey" | "springboard";

export type SchedulingHost = {
  /** The host's email — used to label the booking and reply-to the invite. */
  email: string;
  /** Short form, used in the host dropdown and "Book with —" links. */
  label: string;
  /** Full name, shown on the invite and in the calendar. */
  displayName: string;
  brand: Brand;
  /** Optional external self-book page (a Google Calendar booking page). Only
   *  used by the "Self-book link" dropdown — NOT part of the in-CRM meeting
   *  flow, which schedules into the CRM's own calendar. Absent until published. */
  bookingPageUrl?: string;
};

export const BRAND_LABEL: Record<Brand, string> = {
  nextkey: "NextKey",
  springboard: "Springboard Homes",
};

export const SCHEDULING_HOSTS: SchedulingHost[] = [
  {
    email: "sean.l@nextkey.com.au",
    label: "Sean",
    displayName: "Sean Lewis",
    brand: "nextkey",
    bookingPageUrl: "https://calendar.app.google/19ocFJGhcTHSFKBg7",
  },
  {
    email: "glenn.m@nextkey.com.au",
    label: "Glenn",
    displayName: "Glenn Mayes",
    brand: "nextkey",
    bookingPageUrl: "https://calendar.app.google/tyLLhLCA7k686t5L9",
  },
  {
    // Springboard's own Workspace identity, so invites reach the client from
    // a Springboard address rather than a NextKey one. No booking page yet.
    email: "bookings@springboardhomes.com.au",
    label: "Springboard",
    displayName: "Springboard Homes",
    brand: "springboard",
  },
];

export function hostsForBrand(brand: Brand): SchedulingHost[] {
  return SCHEDULING_HOSTS.filter((h) => h.brand === brand);
}

export function findHost(email: string): SchedulingHost | undefined {
  const needle = email.trim().toLowerCase();
  return SCHEDULING_HOSTS.find((h) => h.email.toLowerCase() === needle);
}
