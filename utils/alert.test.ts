import { describe, it, expect } from "vitest";
import { deriveEventKey, shouldSend, opsAlertWindowMin, type OpsAlertRow } from "./alert";

/**
 * Pure logic for the ops alerting sink. These pin the two properties that make
 * the alerter safe WITHOUT touching Supabase or Brevo:
 *
 *  1. The dedup key is STABLE — same event (+ discriminator) → same key, and
 *     it ignores the per-occurrence message. If this breaks, every occurrence
 *     gets its own key and rate-limiting is defeated (email flood).
 *  2. shouldSend gates on the window — a fresh alert sends, a within-window
 *     repeat suppresses. If this breaks we either spam or go silent.
 */

describe("deriveEventKey", () => {
  it("is stable for the same event", () => {
    expect(deriveEventKey("broadcast.enrolment_failed")).toBe(
      deriveEventKey("broadcast.enrolment_failed"),
    );
  });

  it("ignores the message — key derives from event only", () => {
    // The function has no message parameter by design; two calls with the same
    // event always match regardless of what message the caller logged.
    const a = deriveEventKey("route.5xx");
    const b = deriveEventKey("route.5xx");
    expect(a).toBe(b);
  });

  it("folds in the discriminator so distinct sources dedup separately", () => {
    const a = deriveEventKey("route.5xx", "GET /api/properties/list");
    const b = deriveEventKey("route.5xx", "GET /api/contacts/list");
    expect(a).not.toBe(b);
    expect(a).toBe("route.5xx::get_/api/properties/list");
  });

  it("normalises case and whitespace to a stable slug", () => {
    expect(deriveEventKey("  Broadcast Enrolment  ")).toBe("broadcast_enrolment");
  });

  it("strips odd characters but keeps path/label separators", () => {
    expect(deriveEventKey("mail.send!!", "POST /api/mail/drafts/[id]/send")).toBe(
      "mail.send::post_/api/mail/drafts/id/send",
    );
  });

  it("falls back to 'unknown' for an empty event", () => {
    expect(deriveEventKey("   ")).toBe("unknown");
  });
});

describe("shouldSend", () => {
  const now = new Date("2026-07-12T12:00:00.000Z");
  const WINDOW = 15;

  it("sends when there is no prior row", () => {
    expect(shouldSend(null, now, WINDOW)).toBe(true);
    expect(shouldSend(undefined, now, WINDOW)).toBe(true);
  });

  it("sends when the row has never recorded a send", () => {
    const row: OpsAlertRow = { event_key: "x", last_sent_at: null, suppressed_since_last: 0 };
    expect(shouldSend(row, now, WINDOW)).toBe(true);
  });

  it("suppresses within the window", () => {
    const row: OpsAlertRow = {
      event_key: "x",
      last_sent_at: new Date(now.getTime() - 5 * 60_000).toISOString(), // 5 min ago
      suppressed_since_last: 3,
    };
    expect(shouldSend(row, now, WINDOW)).toBe(false);
  });

  it("sends again once the window has elapsed", () => {
    const row: OpsAlertRow = {
      event_key: "x",
      last_sent_at: new Date(now.getTime() - 20 * 60_000).toISOString(), // 20 min ago
      suppressed_since_last: 42,
    };
    expect(shouldSend(row, now, WINDOW)).toBe(true);
  });

  it("sends exactly at the window boundary", () => {
    const row: OpsAlertRow = {
      event_key: "x",
      last_sent_at: new Date(now.getTime() - 15 * 60_000).toISOString(),
      suppressed_since_last: 0,
    };
    expect(shouldSend(row, now, WINDOW)).toBe(true);
  });

  it("sends (fail-open) when last_sent_at is unparseable", () => {
    const row = { event_key: "x", last_sent_at: "not-a-date", suppressed_since_last: 0 } as OpsAlertRow;
    expect(shouldSend(row, now, WINDOW)).toBe(true);
  });
});

describe("opsAlertWindowMin", () => {
  const KEY = "OPS_ALERT_WINDOW_MIN";
  const withEnv = (val: string | undefined, fn: () => void) => {
    const saved = process.env[KEY];
    if (val === undefined) delete process.env[KEY];
    else process.env[KEY] = val;
    try {
      fn();
    } finally {
      if (saved === undefined) delete process.env[KEY];
      else process.env[KEY] = saved;
    }
  };

  it("defaults to 15 when unset", () => {
    withEnv(undefined, () => expect(opsAlertWindowMin()).toBe(15));
  });

  it("reads a valid override", () => {
    withEnv("30", () => expect(opsAlertWindowMin()).toBe(30));
  });

  it("ignores a non-numeric or non-positive override", () => {
    withEnv("abc", () => expect(opsAlertWindowMin()).toBe(15));
    withEnv("0", () => expect(opsAlertWindowMin()).toBe(15));
    withEnv("-5", () => expect(opsAlertWindowMin()).toBe(15));
  });
});
