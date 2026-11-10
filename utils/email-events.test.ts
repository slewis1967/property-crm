import { describe, it, expect } from "vitest";
import {
  summariseEmailEvents,
  deliveredButUnopened,
  statusLabel,
  type RawEmailEvent,
} from "./email-events";

const ev = (event: string, date: string, over: Partial<RawEmailEvent> = {}): RawEmailEvent => ({
  email: "kimoanhho10@gmail.com",
  subject: "Invitation: Meeting — Kim Ho",
  messageId: "msg-1",
  date,
  event,
  ...over,
});

describe("summariseEmailEvents", () => {
  it("reproduces the Kim Ho case: delivered, never opened", () => {
    // The real events, verbatim from Brevo.
    const rows = summariseEmailEvents([
      ev("delivered", "2026-07-25T13:43:58.000+10:00"),
      ev("requests", "2026-07-25T13:43:57.144+10:00"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("delivered");
    expect(rows[0]!.openedAt).toBeNull();
    expect(deliveredButUnopened(rows[0]!)).toBe(true);
  });

  it("reproduces the Frances case: delivered and opened", () => {
    const rows = summariseEmailEvents([
      ev("opened", "2026-07-26T10:40:26.908+10:00", { messageId: "msg-2" }),
      ev("opened", "2026-07-25T13:48:38.248+10:00", { messageId: "msg-2" }),
      ev("delivered", "2026-07-25T13:31:56.000+10:00", { messageId: "msg-2" }),
      ev("requests", "2026-07-25T13:31:55.343+10:00", { messageId: "msg-2" }),
    ]);
    expect(rows[0]!.status).toBe("opened");
    // FIRST open, not the most recent — "when did they see it" is the question.
    expect(rows[0]!.openedAt).toBe("2026-07-25T13:48:38.248+10:00");
    expect(deliveredButUnopened(rows[0]!)).toBe(false);
  });

  it("never lets a good event mask a failure", () => {
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-25T10:00:00Z"),
      ev("delivered", "2026-07-25T10:00:05Z"),
      ev("hardBounces", "2026-07-25T10:01:00Z"),
    ]);
    expect(rows[0]!.status).toBe("bounced");
    expect(rows[0]!.problem).toMatch(/hard bounce/i);
  });

  it("treats a deferral that later landed as delivered, not as a problem", () => {
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-25T10:00:00Z"),
      ev("deferred", "2026-07-25T10:00:30Z"),
      ev("delivered", "2026-07-25T10:05:00Z"),
    ]);
    expect(rows[0]!.status).toBe("delivered");
    expect(rows[0]!.problem).toBeNull();
  });

  it("keeps a deferral that never landed visible", () => {
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-25T10:00:00Z"),
      ev("deferred", "2026-07-25T10:00:30Z"),
    ]);
    expect(rows[0]!.problem).toMatch(/deferred/i);
  });

  it("separates repeat sends of the same subject", () => {
    // Grouping on subject alone would collapse a weekly reminder into one row
    // and make a single 'delivered' look like it covered every send.
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-01T10:00:00Z", { messageId: "a" }),
      ev("delivered", "2026-07-01T10:00:05Z", { messageId: "a" }),
      ev("requests", "2026-07-08T10:00:00Z", { messageId: "b" }),
      ev("hardBounces", "2026-07-08T10:00:05Z", { messageId: "b" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe("bounced"); // newest first
    expect(rows[1]!.status).toBe("delivered");
  });

  it("still groups when Brevo supplies no messageId", () => {
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-01T10:00:00Z", { messageId: null }),
      ev("delivered", "2026-07-01T10:00:05Z", { messageId: null }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("promotes a click above an open", () => {
    const rows = summariseEmailEvents([
      ev("requests", "2026-07-01T10:00:00Z"),
      ev("delivered", "2026-07-01T10:00:05Z"),
      ev("opened", "2026-07-01T11:00:00Z"),
      ev("clicks", "2026-07-01T11:00:30Z"),
    ]);
    expect(rows[0]!.status).toBe("clicked");
  });

  it("survives an empty event list", () => {
    expect(summariseEmailEvents([])).toEqual([]);
  });
});

describe("statusLabel", () => {
  it("gives every status a human label", () => {
    for (const status of ["clicked", "opened", "delivered", "sent", "bounced", "blocked", "spam", "failed"] as const) {
      const label = statusLabel({ subject: "", sentAt: null, deliveredAt: null, openedAt: null, status, problem: null });
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
