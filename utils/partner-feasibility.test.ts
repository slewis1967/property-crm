import { describe, expect, it } from "vitest";
import {
  DEFAULT_MONTHLY_REPORTS,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  PARTNER_FEASIBILITY_DISCLAIMER,
  boundedTranscript,
  brisbaneMonthStart,
  cleanAddress,
  monthlyAllowance,
  storableReport,
  feasibilityView,
} from "./partner-feasibility";
import { feasibilitySystemPrompt } from "./planning-feasibility";
import { PARTNER_FEATURES, TIER_DEFINITIONS } from "./partner";

describe("monthly allowance", () => {
  it("defaults to 10 and accepts a sane override only", () => {
    expect(monthlyAllowance(undefined)).toBe(DEFAULT_MONTHLY_REPORTS);
    expect(monthlyAllowance("25")).toBe(25);
    expect(monthlyAllowance("0")).toBe(0);
    expect(monthlyAllowance("-1")).toBe(DEFAULT_MONTHLY_REPORTS);
    expect(monthlyAllowance("lots")).toBe(DEFAULT_MONTHLY_REPORTS);
    expect(monthlyAllowance("100000")).toBe(DEFAULT_MONTHLY_REPORTS);
  });
  it("the month is Brisbane's, not UTC's", () => {
    // 1 Dec 2026 06:00 Brisbane = 30 Nov 20:00 UTC: already December in Brisbane.
    expect(brisbaneMonthStart(new Date("2026-11-30T20:00:00Z")).toISOString()).toBe("2026-11-30T14:00:00.000Z");
    // 30 Nov 2026 23:00 Brisbane = 13:00 UTC: still November.
    expect(brisbaneMonthStart(new Date("2026-11-30T13:00:00Z")).toISOString()).toBe("2026-10-31T14:00:00.000Z");
  });
});

describe("input caps", () => {
  it("rejects oversized or malformed transcripts", () => {
    expect(boundedTranscript([{ role: "user", content: "hi" }])).toHaveLength(1);
    expect(boundedTranscript([])).toBeNull();
    expect(boundedTranscript("x")).toBeNull();
    expect(boundedTranscript([{ role: "system", content: "x" }])).toBeNull();
    expect(boundedTranscript([{ role: "user", content: "x".repeat(MAX_MESSAGE_CHARS + 1) }])).toBeNull();
    expect(boundedTranscript(Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: "user", content: "x" })))).toBeNull();
  });
  it("cleans addresses", () => {
    expect(cleanAddress("  12  Example St,  Kelso QLD 4815 ")).toBe("12 Example St, Kelso QLD 4815");
    expect(cleanAddress("short")).toBeNull();
    expect(cleanAddress(42)).toBeNull();
  });
});

describe("brand", () => {
  it("the partner prompt names no firm; the staff prompt still says NextKey", () => {
    for (const phase of ["interview", "report"] as const) {
      expect(feasibilitySystemPrompt(phase, "neutral")).not.toMatch(/NextKey/);
      expect(feasibilitySystemPrompt(phase, "nextkey")).toMatch(/NextKey Property Strategists/);
    }
  });
  it("the printed disclaimer names no brand", () => {
    expect(PARTNER_FEASIBILITY_DISCLAIMER).not.toMatch(/NextKey|Springboard/);
  });
  it("feasibility is built and is Enterprise-only", () => {
    expect(PARTNER_FEATURES.feasibility.built).toBe(true);
    expect(TIER_DEFINITIONS.professional.features).not.toContain("feasibility");
    expect(TIER_DEFINITIONS.enterprise.features).toContain("feasibility");
  });
});

describe("storableReport", () => {
  it("strips NUL characters that would make the jsonb save fail", () => {
    const r = storableReport({ title: "A\u0000B", sections: [{ heading: "x\u0000", blocks: [] }] });
    expect(JSON.stringify(r)).not.toContain("\u0000");
    expect(r.title).toBe("AB");
  });
  it("always returns an object", () => {
    expect(storableReport(null)).toEqual({});
    expect(storableReport([1, 2])).toEqual({});
  });
});

describe("feasibilityView", () => {
  const t0 = Date.parse("2026-11-17T05:00:00Z");
  const row = (over: Record<string, unknown>) => ({ status: "pending", error: null, created_at: "2026-11-17T05:00:00Z", job_started_at: null, ...over }) as Parameters<typeof feasibilityView>[0];
  it("ready and failed pass through", () => {
    expect(feasibilityView(row({ status: "ready" }), t0).status).toBe("ready");
    expect(feasibilityView(row({ status: "failed", error: "x" }), t0)).toMatchObject({ status: "failed", error: "x" });
  });
  it("asks again only when nobody started it for over a minute", () => {
    expect(feasibilityView(row({}), t0 + 30_000).needsRetrigger).toBe(false);
    expect(feasibilityView(row({}), t0 + 61_000).needsRetrigger).toBe(true);
    expect(feasibilityView(row({ job_started_at: "2026-11-17T05:00:05Z" }), t0 + 61_000).needsRetrigger).toBe(false);
  });
  it("a job that died shows as failed after ten minutes, not 'being written' for ever", () => {
    expect(feasibilityView(row({ job_started_at: "2026-11-17T05:00:05Z" }), t0 + 11 * 60_000).status).toBe("failed");
  });
});
