/**
 * Self-book availability engine — pure, no deps, no tz library.
 *
 * Powers the in-house self-book page (app/book/[host]) that replaced the
 * Google Calendar booking pages. Given the host's already-booked meetings, it
 * produces the open slots a lead can pick from.
 *
 * Timezone: all slots are generated against **AEST (UTC+10)**. Queensland does
 * not observe daylight saving, so the offset is a constant — we can build slot
 * instants from `…+10:00` ISO strings with zero tz-library risk. NextKey is a
 * QLD business; revisit this if hosts in a DST state are ever added.
 */

export interface BookingConfig {
  /** Slot length in minutes. */
  slotMinutes: number;
  /** First slot start hour (AEST, 24h). */
  dayStartHour: number;
  /** Last slot must END by this hour (AEST, 24h). */
  dayEndHour: number;
  /** Allowed weekdays, 0=Sun … 6=Sat (AEST). Default Mon–Fri. */
  weekdays: number[];
  /** How many days ahead to offer (including today). */
  lookaheadDays: number;
  /** Minimum notice before a slot, in minutes (no "in 5 minutes" bookings). */
  minLeadMinutes: number;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  slotMinutes: 30,
  dayStartHour: 9,
  dayEndHour: 17,
  weekdays: [1, 2, 3, 4, 5],
  lookaheadDays: 14,
  minLeadMinutes: 120,
};

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000;

export interface Interval {
  startMs: number;
  endMs: number;
}

export interface Slot {
  /** UTC ISO instant for the slot start. */
  startISO: string;
  /** UTC ISO instant for the slot end. */
  endISO: string;
  /** "HH:MM" in AEST, for the button label. */
  label: string;
}

export interface DayAvailability {
  /** "YYYY-MM-DD" in AEST. */
  date: string;
  /** Human weekday+date label, AEST. */
  label: string;
  slots: Slot[];
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** The AEST calendar parts for a UTC instant (QLD has no DST). */
function aestParts(ms: number): { y: number; m: number; d: number; weekday: number } {
  const shifted = new Date(ms + AEST_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

/** Build the UTC instant (ms) for an AEST wall-clock time on a given date. */
function aestInstant(y: number, m: number, d: number, hour: number, minute: number): number {
  return Date.parse(`${y}-${pad(m)}-${pad(d)}T${pad(hour)}:${pad(minute)}:00+10:00`);
}

function overlapsBusy(startMs: number, endMs: number, busy: Interval[]): boolean {
  for (const b of busy) {
    if (startMs < b.endMs && endMs > b.startMs) return true;
  }
  return false;
}

/**
 * Compute open booking slots grouped by day. Days with no free slots are
 * omitted, so an empty result means "nothing available in the window".
 */
export function computeAvailability(
  nowMs: number,
  busy: Interval[],
  config: Partial<BookingConfig> = {},
): DayAvailability[] {
  const cfg = { ...DEFAULT_BOOKING_CONFIG, ...config };
  const slotMs = cfg.slotMinutes * 60_000;
  const earliestMs = nowMs + cfg.minLeadMinutes * 60_000;
  const days: DayAvailability[] = [];

  for (let offset = 0; offset < cfg.lookaheadDays; offset++) {
    // Step day-by-day in real time and read each day's AEST calendar parts;
    // aestParts handles month/year rollovers, and QLD's no-DST offset means the
    // shift is constant so no slot lands on the wrong wall-clock hour.
    const { y, m, d, weekday } = aestParts(nowMs + offset * 86_400_000);
    if (!cfg.weekdays.includes(weekday)) continue;

    const slots: Slot[] = [];
    for (let hour = cfg.dayStartHour; hour < cfg.dayEndHour; hour++) {
      for (let min = 0; min < 60; min += cfg.slotMinutes) {
        const startMs = aestInstant(y, m, d, hour, min);
        const endMs = startMs + slotMs;
        // Slot must end by the day-end hour.
        const dayEndMs = aestInstant(y, m, d, cfg.dayEndHour, 0);
        if (endMs > dayEndMs) continue;
        if (startMs < earliestMs) continue;
        if (overlapsBusy(startMs, endMs, busy)) continue;
        slots.push({
          startISO: new Date(startMs).toISOString(),
          endISO: new Date(endMs).toISOString(),
          label: `${pad(hour)}:${pad(min)}`,
        });
      }
    }
    if (slots.length === 0) continue;

    const dateStr = `${y}-${pad(m)}-${pad(d)}`;
    const label = new Intl.DateTimeFormat("en-AU", {
      weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane",
    }).format(new Date(aestInstant(y, m, d, 12, 0)));
    days.push({ date: dateStr, label, slots });
  }

  return days;
}

/**
 * Validate that a proposed slot start is a real, currently-open slot for the
 * host. Used by the booking POST so a crafted request can't book an arbitrary
 * time (outside hours, in the past, or over an existing meeting).
 */
export function isSlotAvailable(
  startISO: string,
  nowMs: number,
  busy: Interval[],
  config: Partial<BookingConfig> = {},
): boolean {
  const startMs = Date.parse(startISO);
  if (!Number.isFinite(startMs)) return false;
  return computeAvailability(nowMs, busy, config).some((day) =>
    day.slots.some((s) => Date.parse(s.startISO) === startMs),
  );
}
