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
  /** URL-safe id for the in-house self-book page at /book/<slug>. Unique. */
  slug: string;
  /**
   * Extra inboxes that get the "new booking" heads-up alongside `email`.
   * Exists because a host can be a shared identity nobody reads — the
   * Springboard bookings@ inbox went unwatched and a lead who self-booked
   * twice was stood up twice before anyone noticed (Aug 2026).
   */
  notify?: string[];
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
    slug: "sean",
  },
  {
    email: "glenn.m@nextkey.com.au",
    label: "Glenn",
    displayName: "Glenn Mayes",
    brand: "nextkey",
    slug: "glenn",
  },
  {
    // Springboard's own Workspace identity, so invites reach the client from
    // a Springboard address rather than a NextKey one.
    email: "bookings@springboardhomes.com.au",
    label: "Springboard",
    displayName: "Springboard Homes",
    brand: "springboard",
    slug: "springboard",
    // Glenn takes Springboard meetings; Sean backstops. Nobody lives in the
    // bookings@ mailbox, so a booking notified only there is a missed meeting.
    notify: ["glenn.m@nextkey.com.au", "sean.l@nextkey.com.au"],
  },
];

/** Everyone who should hear about a booking with this host, deduplicated. */
export function bookingNotifyRecipients(host: SchedulingHost): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const email of [host.email, ...(host.notify ?? [])]) {
    const key = email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export function hostsForBrand(brand: Brand): SchedulingHost[] {
  return SCHEDULING_HOSTS.filter((h) => h.brand === brand);
}

export function findHost(email: string): SchedulingHost | undefined {
  const needle = email.trim().toLowerCase();
  return SCHEDULING_HOSTS.find((h) => h.email.toLowerCase() === needle);
}

export function findHostBySlug(slug: string): SchedulingHost | undefined {
  const needle = slug.trim().toLowerCase();
  return SCHEDULING_HOSTS.find((h) => h.slug === needle);
}
