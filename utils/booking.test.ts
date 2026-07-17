import { describe, it, expect } from "vitest";
import { computeAvailability, isSlotAvailable, type Interval } from "./booking";

// A fixed "now": Monday 20 July 2026, 00:00 AEST (= 2026-07-19T14:00:00Z).
const MON_20_JUL_MIDNIGHT_AEST = Date.parse("2026-07-20T00:00:00+10:00");

// Small config for deterministic tests: 1-day lookahead, no lead-time gate.
const cfg = { lookaheadDays: 1, minLeadMinutes: 0 };

describe("computeAvailability", () => {
  it("generates 30-min slots across business hours on a weekday", () => {
    const days = computeAvailability(MON_20_JUL_MIDNIGHT_AEST, [], cfg);
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe("2026-07-20");
    // 09:00–17:00, 30-min slots ending by 17:00 → 16 slots (last 16:30–17:00).
    expect(days[0].slots).toHaveLength(16);
    expect(days[0].slots[0].label).toBe("09:00");
    expect(days[0].slots[15].label).toBe("16:30");
    expect(days[0].slots[0].startISO).toBe("2026-07-19T23:00:00.000Z"); // 09:00 AEST
  });

  it("skips weekends", () => {
    // Saturday 25 Jul 2026.
    const sat = Date.parse("2026-07-25T00:00:00+10:00");
    expect(computeAvailability(sat, [], cfg)).toHaveLength(0);
  });

  it("excludes slots overlapping a busy interval", () => {
    const busy: Interval[] = [
      { startMs: Date.parse("2026-07-20T10:00:00+10:00"), endMs: Date.parse("2026-07-20T11:00:00+10:00") },
    ];
    const days = computeAvailability(MON_20_JUL_MIDNIGHT_AEST, busy, cfg);
    const labels = days[0].slots.map((s) => s.label);
    expect(labels).not.toContain("10:00");
    expect(labels).not.toContain("10:30");
    expect(labels).toContain("09:30");
    expect(labels).toContain("11:00");
  });

  it("honours the minimum lead time", () => {
    // now = Monday 09:15 AEST; 120-min lead → first bookable slot is 11:30.
    const now = Date.parse("2026-07-20T09:15:00+10:00");
    const days = computeAvailability(now, [], { lookaheadDays: 1, minLeadMinutes: 120 });
    expect(days[0].slots[0].label).toBe("11:30");
  });

  it("omits fully-booked days entirely", () => {
    const busy: Interval[] = [
      { startMs: Date.parse("2026-07-20T09:00:00+10:00"), endMs: Date.parse("2026-07-20T17:00:00+10:00") },
    ];
    expect(computeAvailability(MON_20_JUL_MIDNIGHT_AEST, busy, cfg)).toHaveLength(0);
  });
});

describe("isSlotAvailable", () => {
  it("accepts a real open slot", () => {
    expect(isSlotAvailable("2026-07-19T23:00:00.000Z", MON_20_JUL_MIDNIGHT_AEST, [], cfg)).toBe(true);
  });

  it("rejects a slot outside business hours", () => {
    // 08:00 AEST = 2026-07-19T22:00Z — before the 09:00 start.
    expect(isSlotAvailable("2026-07-19T22:00:00.000Z", MON_20_JUL_MIDNIGHT_AEST, [], cfg)).toBe(false);
  });

  it("rejects a slot that collides with a busy interval", () => {
    const busy: Interval[] = [
      { startMs: Date.parse("2026-07-20T10:00:00+10:00"), endMs: Date.parse("2026-07-20T10:30:00+10:00") },
    ];
    // 10:00 AEST = 2026-07-20T00:00Z.
    expect(isSlotAvailable("2026-07-20T00:00:00.000Z", MON_20_JUL_MIDNIGHT_AEST, busy, cfg)).toBe(false);
  });

  it("rejects an off-grid time", () => {
    // 09:07 AEST is not a slot boundary.
    expect(isSlotAvailable("2026-07-19T23:07:00.000Z", MON_20_JUL_MIDNIGHT_AEST, [], cfg)).toBe(false);
  });
});
