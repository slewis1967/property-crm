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
