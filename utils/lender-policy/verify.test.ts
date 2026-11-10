import { describe, expect, it } from "vitest";
import {
  coverageScore,
  isIsoDate,
  looksLikeSourceUrl,
  matchableValue,
  verifyFact,
  verifyPolicy,
} from "./verify";
import { hydratePolicy } from "./index";
import type { Fact, LenderPolicy } from "./types";

const TODAY = "2026-07-29";

function fact<T>(value: T, over: Partial<Fact<T>> = {}): Fact<T> {
  return {
    value,
    asAt: "2026-06-01",
    sourceUrl: "https://broker.example.com.au/policy/serviceability",
    confidence: "high",
    status: "verified",
    ...over,
  };
}

describe("looksLikeSourceUrl", () => {
  it("accepts a real page link", () => {
    expect(looksLikeSourceUrl("https://broker.cba.com.au/policy/lvr.html")).toBe(true);
    expect(looksLikeSourceUrl("https://x.com.au/?doc=policy")).toBe(true);
  });

  it("rejects a bare origin — you don't read a buffer off a homepage", () => {
    expect(looksLikeSourceUrl("https://www.cba.com.au")).toBe(false);
    expect(looksLikeSourceUrl("https://www.cba.com.au/")).toBe(false);
  });

  it("rejects non-http schemes and junk", () => {
    expect(looksLikeSourceUrl("file:///c/policy.pdf")).toBe(false);
    expect(looksLikeSourceUrl("broker.cba.com.au/policy")).toBe(false);
    expect(looksLikeSourceUrl("")).toBe(false);
    expect(looksLikeSourceUrl(null)).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts a real date and rejects an impossible one", () => {
    expect(isIsoDate("2026-06-01")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-6-1")).toBe(false);
    expect(isIsoDate("01/06/2026")).toBe(false);
  });
});

describe("verifyFact — provenance is non-negotiable", () => {
  it("passes a fully sourced, plausible fact", () => {
    const v = verifyFact(fact(3), { path: "servicing.assessmentBufferPct", today: TODAY });
    expect(v.status).toBe("verified");
    expect(v.matchable).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it("demotes a fact with no source URL", () => {
    const v = verifyFact(fact(3, { sourceUrl: null }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.status).toBe("unverified");
    expect(v.matchable).toBe(false);
    expect(v.issues).toContain("missing_source_url");
  });

  it("demotes a fact with no as-at date", () => {
    const v = verifyFact(fact(3, { asAt: null }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.matchable).toBe(false);
    expect(v.issues).toContain("missing_as_at");
  });

  it("demotes an implausible value even when perfectly sourced", () => {
    // 47% is a misread of "4.7" or a % of something else. Never a buffer.
    const v = verifyFact(fact(47), { path: "servicing.assessmentBufferPct", today: TODAY });
    expect(v.matchable).toBe(false);
    expect(v.issues).toContain("out_of_range");
  });

  it("demotes low confidence", () => {
    const v = verifyFact(fact(3, { confidence: "low" }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.matchable).toBe(false);
    expect(v.issues).toContain("low_confidence");
  });

  it("demotes a stale source", () => {
    const v = verifyFact(fact(3, { asAt: "2020-01-01" }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.issues).toContain("stale");
  });

  it("rejects an as-at date in the future", () => {
    const v = verifyFact(fact(3, { asAt: "2027-01-01" }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.issues).toContain("as_at_in_future");
  });

  it("lets a broker's confirmation past the range and confidence heuristics", () => {
    // Deliberately outside the plausible range AND low confidence: a human who
    // read the actual policy document outranks both.
    const v = verifyFact(fact(47, { confidence: "low", status: "human_confirmed" }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.status).toBe("human_confirmed");
    expect(v.matchable).toBe(true);
  });

  it("still requires provenance from a human confirmation", () => {
    const v = verifyFact(fact(3, { status: "human_confirmed", sourceUrl: null }), {
      path: "servicing.assessmentBufferPct",
      today: TODAY,
    });
    expect(v.matchable).toBe(false);
  });

  it("treats an explicit not_found as terminal, not as a failure to re-check", () => {
    const v = verifyFact(
      { value: null, asAt: null, sourceUrl: null, confidence: "low", status: "not_found" },
      { path: "servicing.dtiCap", today: TODAY },
    );
    expect(v.status).toBe("not_found");
    expect(v.issues).toEqual([]);
    expect(v.matchable).toBe(false);
  });

  it("treats a missing fact as not_found", () => {
    expect(verifyFact(undefined, { today: TODAY }).status).toBe("not_found");
  });
});

describe("matchableValue", () => {
  it("returns the value only when it survives verification", () => {
    expect(matchableValue(fact(3), "servicing.assessmentBufferPct", TODAY)).toBe(3);
    expect(
      matchableValue(fact(3, { sourceUrl: null }), "servicing.assessmentBufferPct", TODAY),
    ).toBeNull();
  });
});

describe("verifyPolicy", () => {
  const policy: LenderPolicy = hydratePolicy({
    id: "example",
    name: "Example Bank",
    servicing: {
      assessmentBufferPct: fact(3),
      dtiCap: fact(6, { sourceUrl: null }),
      rentShadingPct: {
        value: null,
        asAt: null,
        sourceUrl: null,
        confidence: "low",
        status: "not_found",
      },
    },
  } as Partial<LenderPolicy> & { id: string; name: string });

  it("overwrites the researcher's own status claim with the verdict", () => {
    const { policy: verified, counts, issues } = verifyPolicy(policy, TODAY);
    expect(verified.servicing.assessmentBufferPct?.status).toBe("verified");
    // Claimed "verified" by the researcher; demoted because it has no source.
    expect(verified.servicing.dtiCap?.status).toBe("unverified");
    expect(issues["servicing.dtiCap"]).toContain("missing_source_url");
    expect(counts).toEqual({
      total: 3,
      verified: 1,
      humanConfirmed: 0,
      unverified: 1,
      notFound: 1,
    });
  });

  it("does not mutate the input", () => {
    verifyPolicy(policy, TODAY);
    expect(policy.servicing.dtiCap?.status).toBe("verified");
  });

  it("scores coverage over researched fields", () => {
    const { counts } = verifyPolicy(policy, TODAY);
    expect(coverageScore(counts)).toBeCloseTo(1 / 3);
    expect(coverageScore({ total: 0, verified: 0, humanConfirmed: 0, unverified: 0, notFound: 0 })).toBe(0);
  });
});
