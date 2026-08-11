/**
 * One timezone for every meeting time the CRM renders.
 *
 * Bare `toLocaleString("en-AU", …)` sets the *locale*, not the zone — it falls
 * back to whatever the runtime is. That is the browser (Brisbane) in a client
 * component but the server (UTC on Netlify) in a server component, so the same
 * booking read 10:00 am on /calendar and 12:00 am on /appointments. Brisbane
 * has no DST, so a fixed zone is correct year-round for the whole business.
 *
 * Pure — safe to import from both server and client components.
 */
export const BUSINESS_TIME_ZONE = "Australia/Brisbane";

const LOCALE = "en-AU";

type DateInput = string | number | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function format(value: DateInput, options: Intl.DateTimeFormatOptions, fallback: string) {
  const d = toDate(value);
  if (!d) return fallback;
  return d.toLocaleString(LOCALE, { ...options, timeZone: BUSINESS_TIME_ZONE });
}

/** "11 Aug 2026, 1:00 pm" */
export function formatDateTime(value: DateInput, fallback = "—") {
  return format(value, { dateStyle: "medium", timeStyle: "short" }, fallback);
}

/** "Tue, 11 Aug, 1:00 pm" — the compact agenda form used in booking lists. */
export function formatAgendaDateTime(value: DateInput, fallback = "—") {
  return format(
    value,
    { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" },
    fallback,
  );
}

/** "1:00 pm" */
export function formatTime(value: DateInput, fallback = "—") {
  return format(value, { timeStyle: "short" }, fallback);
}

/** "Tuesday, 11 August, 1:00 pm" — the calendar popover's long form. */
export function formatLongDateTime(value: DateInput, fallback = "—") {
  return format(
    value,
    { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" },
    fallback,
  );
}

/**
 * The business-timezone calendar day an instant falls on, as "YYYY-MM-DD".
 * Use this to bucket appointments into day cells — `getDate()` reads the
 * runtime's zone, so an 8am Brisbane meeting lands on the previous day for
 * anyone whose browser is behind UTC+10.
 */
export function businessDayKey(value: DateInput): string | null {
  const d = toDate(value);
  if (!d) return null;
  // "en-CA" formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
