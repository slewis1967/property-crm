import { describe, it, expect } from "vitest";
import {
  summarise,
  rollupBySource,
  relativeTime,
  explainFailure,
  normaliseSeverity,
  STALE_AFTER_MINUTES,
  type TelegramEvent,
} from "./telegram-health";

const NOW = new Date("2026-07-20T12:00:00Z");

/** Minutes before NOW, as an ISO string. */
function ago(mins: number): string {
  return new Date(NOW.getTime() - mins * 60000).toISOString();
}

function ev(over: Partial<TelegramEvent> = {}): TelegramEvent {
  return {
    id: Math.random().toString(36).slice(2),
    source: "oncall_agent",
    direction: "outbound",
    chat_id: "8667708827",
    text: "something broke",
    ok: true,
    error_code: null,
    error_desc: null,
    severity: "info",
    category: "delivered",
    meta: {},
    created_at: ago(5),
    ...over,
  };
}

describe("summarise", () => {
  it("reports unknown when there are no events at all", () => {
    const s = summarise([], NOW);
    expect(s.status).toBe("unknown");
    expect(s.total).toBe(0);
  });

  it("is healthy when every recent send delivered", () => {
    const s = summarise([ev(), ev({ source: "director_agent" })], NOW);
    expect(s.status).toBe("healthy");
    expect(s.failures).toBe(0);
  });

  it("is degraded when a send was rejected", () => {
    const s = summarise(
      [ev(), ev({ ok: false, error_code: 400, category: "parse_error", severity: "error" })],
      NOW,
    );
    expect(s.status).toBe("degraded");
    expect(s.failures).toBe(1);
  });

  it("escalates to critical when the failure means alerts reach nobody", () => {
    const s = summarise(
      [ev({ ok: false, error_code: 401, category: "auth", severity: "critical" })],
      NOW,
    );
    expect(s.status).toBe("critical");
  });

  // The distinction the whole feature turns on: a scary message that DELIVERED
  // is the system working. Only a failed delivery is a health problem.
  it("does not go critical just because a delivered message was itself critical", () => {
    const s = summarise([ev({ severity: "critical", ok: true })], NOW);
    expect(s.status).toBe("healthy");
    expect(s.criticalCount).toBe(0);
  });

  it("treats a long silence as degraded, not healthy", () => {
    const s = summarise([ev({ created_at: ago(STALE_AFTER_MINUTES + 60) })], NOW);
    expect(s.status).toBe("degraded");
    expect(s.minutesSinceOk).toBeGreaterThan(STALE_AFTER_MINUTES);
  });

  it("tracks last successful send separately from last event", () => {
    const s = summarise(
      [
        ev({ created_at: ago(1), ok: false, category: "rate_limit", error_code: 429 }),
        ev({ created_at: ago(30), ok: true }),
      ],
      NOW,
    );
    expect(s.lastEventAt).toBe(ago(1));
    expect(s.lastOkAt).toBe(ago(30));
  });
});

describe("rollupBySource", () => {
  it("groups per script and surfaces the worst severity seen", () => {
    const rows = rollupBySource([
      ev({ source: "a", severity: "info" }),
      ev({ source: "a", severity: "error" }),
      ev({ source: "b", severity: "info" }),
    ]);
    const a = rows.find((r) => r.source === "a")!;
    expect(a.total).toBe(2);
    expect(a.worstSeverity).toBe("error");
  });

  it("ranks sources with failures above quiet healthy ones", () => {
    const rows = rollupBySource([
      ev({ source: "quiet" }),
      ev({ source: "quiet" }),
      ev({ source: "quiet" }),
      ev({ source: "broken", ok: false, category: "auth" }),
    ]);
    expect(rows[0].source).toBe("broken");
  });

  it("counts a source with only failures as having no successful send", () => {
    const rows = rollupBySource([ev({ source: "x", ok: false, category: "auth" })]);
    expect(rows[0].lastOkAt).toBeNull();
    expect(rows[0].failures).toBe(1);
  });
});

describe("relativeTime", () => {
  it("renders never / minutes / hours / days", () => {
    expect(relativeTime(null, NOW)).toBe("never");
    expect(relativeTime(ago(5), NOW)).toBe("5m ago");
    expect(relativeTime(ago(120), NOW)).toBe("2h ago");
    expect(relativeTime(ago(60 * 24 * 3), NOW)).toBe("3d ago");
  });

  it("does not render a negative age for slight clock skew", () => {
    expect(relativeTime(new Date(NOW.getTime() + 30_000).toISOString(), NOW)).toBe("just now");
  });
});

describe("explainFailure", () => {
  it("says nothing about a successful send", () => {
    expect(explainFailure(ev())).toBeNull();
  });

  it("explains an auth failure in terms of the fix", () => {
    const msg = explainFailure(ev({ ok: false, category: "auth" }))!;
    expect(msg).toMatch(/TELEGRAM_BOT_TOKEN/);
  });

  it("falls back to Telegram's own description for unrecognised categories", () => {
    const msg = explainFailure(
      ev({ ok: false, category: "something_new", error_desc: "Bad Request: weird" }),
    );
    expect(msg).toBe("Bad Request: weird");
  });
});

describe("normaliseSeverity", () => {
  it("defaults unknown or missing values to info", () => {
    expect(normaliseSeverity(null)).toBe("info");
    expect(normaliseSeverity("warn")).toBe("info"); // NEXUS spelling is normalised at the sender
    expect(normaliseSeverity("critical")).toBe("critical");
  });
});
