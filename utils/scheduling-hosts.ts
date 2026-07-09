/**
 * The canonical list of people whose calendars the CRM can book into.
 *
 * `email` is the key: /api/appointments looks up the matching refresh_token
 * in public.calendar_credentials, so a host only becomes bookable once they
 * have connected their Google account via Settings → Calendar connections.
 * Until then, scheduling against them saves the CRM row and skips the invite.
 *
 * This list was previously duplicated in OpportunityDetail.tsx and
 * CalendarConnections.tsx, and the two copies disagreed on Glenn's surname.
 */

export type Brand = "nextkey" | "springboard";

export type SchedulingHost = {
  /** Must exactly match the Google account signed in at consent time — the
   *  OAuth callback rejects a mismatch. */
  email: string;
  /** Short form, used in the host dropdown and "Book with —" links. */
  label: string;
  /** Full name, used in the Settings connection panel. */
  displayName: string;
  brand: Brand;
  /** Google Calendar self-book page. Absent until the host publishes one. */
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
