import { describe, it, expect } from "vitest";
import {
  BUSINESS_TIME_ZONE,
  businessDayKey,
  formatAgendaDateTime,
  formatDateTime,
  formatLongDateTime,
  formatTime,
} from "./datetime";

/**
 * The bug these guard against: /appointments renders on the server (UTC on
 * Netlify) and /calendar renders in the browser (Brisbane), so an unpinned
 * formatter showed the same booking 10 hours apart. Every expectation below is
 * a literal — if a formatter ever falls back to the runtime zone, the value
 * changes and the test fails regardless of where it runs.
 */

// 2026-08-11T03:00:00Z === 1:00 pm Tuesday 11 Aug in Brisbane (UTC+10).
const AFTERNOON = "2026-08-11T03:00:00+00:00";
// 2026-08-11T22:30:00Z === 8:30 am Wednesday 12 Aug in Brisbane — the instant
// falls on a *different calendar day* in UTC, which is what broke day bucketing.
const NEXT_DAY_MORNING = "2026-08-11T22:30:00+00:00";

describe("business timezone", () => {
  it("is Brisbane, which has no DST", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Australia/Brisbane");
  });

  it("renders the same instant identically in January and July", () => {
    // If a DST-observing zone were ever substituted, one of these shifts by an hour.
    expect(formatTime("2026-01-15T03:00:00Z")).toBe(formatTime("2026-07-15T03:00:00Z"));
  });
});

describe("formatters are pinned, not runtime-dependent", () => {
  it("formatDateTime", () => {
    expect(formatDateTime(AFTERNOON)).toBe("11 Aug 2026, 1:00 pm");
  });

  it("formatAgendaDateTime", () => {
    expect(formatAgendaDateTime(AFTERNOON)).toBe("Tue, 11 Aug, 1:00 pm");
  });

  it("formatTime", () => {
    expect(formatTime(AFTERNOON)).toBe("1:00 pm");
  });

  it("formatLongDateTime", () => {
    expect(formatLongDateTime(AFTERNOON)).toBe("Tuesday 11 August at 1:00 pm");
  });

  it("accepts a Date as readily as an ISO string", () => {
    expect(formatDateTime(new Date(AFTERNOON))).toBe(formatDateTime(AFTERNOON));
  });

  it("rolls an instant into the correct Brisbane day, not the UTC one", () => {
    expect(formatDateTime(NEXT_DAY_MORNING)).toBe("12 Aug 2026, 8:30 am");
  });
});

describe("blank and malformed input", () => {
  it.each([null, undefined, ""])("renders %p as the fallback", (v) => {
    expect(formatDateTime(v)).toBe("—");
    expect(formatTime(v)).toBe("—");
    expect(businessDayKey(v)).toBeNull();
  });

  it("renders an unparseable string as the fallback rather than 'Invalid Date'", () => {
    expect(formatDateTime("not a date")).toBe("—");
  });

  it("honours a caller-supplied fallback", () => {
    expect(formatDateTime(null, "Not set")).toBe("Not set");
  });
});

describe("businessDayKey", () => {
  it("buckets by the Brisbane calendar day", () => {
    expect(businessDayKey(AFTERNOON)).toBe("2026-08-11");
  });

  it("puts a late-evening-UTC instant on the following Brisbane day", () => {
    // The whole point: bucketing on UTC would file this under 11 Aug and the
    // meeting would appear in yesterday's cell on the calendar grid.
    expect(businessDayKey(NEXT_DAY_MORNING)).toBe("2026-08-12");
  });

  it("zero-pads so keys sort lexicographically and match the grid's format", () => {
    expect(businessDayKey("2026-01-05T00:00:00+10:00")).toBe("2026-01-05");
  });
});
