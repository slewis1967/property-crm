import { describe, expect, it } from "vitest";
import { applyFieldReviews, policyToRow, rowToPolicy, type FieldReview } from "./store";
import { hydratePolicy } from "./index";
import type { Fact, LenderPolicy } from "./types";

const TODAY = "2026-07-29";

function researched(): LenderPolicy {
  return hydratePolicy({
    id: "example",
    name: "Example Bank",
    servicing: {
      assessmentBufferPct: {
        value: 3,
        asAt: "2026-06-01",
        sourceUrl: "https://broker.example.com.au/policy/serviceability",
        confidence: "medium",
        status: "verified",
      } satisfies Fact<number>,
    },
  } as Partial<LenderPolicy> & { id: string; name: string });
}

function review(over: Partial<FieldReview> = {}): FieldReview {
  return {
    lender_id: "example",
    field_path: "servicing.assessmentBufferPct",
    value: 3.25,
    as_at: "2026-07-20",
    source_url: "https://broker.example.com.au/policy/2026-update",
    source_title: "Credit policy guide v15",
    note: "Confirmed with BDM",
    confirmed_by: "sean@nextkey.com.au",
    confirmed_at: "2026-07-20T04:00:00Z",
    ...over,
  };
}

describe("applyFieldReviews", () => {
  it("replaces the researched fact and stamps it human_confirmed", () => {
    const out = applyFieldReviews(researched(), [review()]);
    const fact = out.servicing.assessmentBufferPct;
    expect(fact?.value).toBe(3.25);
    expect(fact?.status).toBe("human_confirmed");
    expect(fact?.asAt).toBe("2026-07-20");
    expect(fact?.updatedBy).toBe("sean@nextkey.com.au");
  });

  it("does NOT mutate the policy it was given", () => {
    // A shallow spread leaves the section objects shared. Mutating them would
    // silently corrupt the researched record held by the caller (and, for the
    // bundled pack, every subsequent read in the same process).
    const original = researched();
    applyFieldReviews(original, [review()]);
    expect(original.servicing.assessmentBufferPct?.value).toBe(3);
    expect(original.servicing.assessmentBufferPct?.status).toBe("verified");
  });

  it("returns the policy untouched when there are no reviews", () => {
    const p = researched();
    expect(applyFieldReviews(p, [])).toBe(p);
  });

  it("ignores a malformed field path rather than throwing", () => {
    const out = applyFieldReviews(researched(), [review({ field_path: "nonsense" })]);
    expect(out.servicing.assessmentBufferPct?.value).toBe(3);
  });
});

describe("row round-trip", () => {
  it("survives policy → row → policy", () => {
    const policy = researched();
    const row = policyToRow(policy, TODAY);
    const back = rowToPolicy({
      ...row,
      data: row.data as Record<string, unknown>,
    } as Parameters<typeof rowToPolicy>[0]);
    expect(back.id).toBe(policy.id);
    expect(back.name).toBe(policy.name);
    expect(back.servicing.assessmentBufferPct?.value).toBe(3);
    expect(back.servicing.assessmentBufferPct?.sourceUrl).toBe(
      "https://broker.example.com.au/policy/serviceability",
    );
  });

  it("stores verification counts computed from the verdict, not the claim", () => {
    const policy = hydratePolicy({
      id: "example",
      name: "Example Bank",
      servicing: {
        // Claims "verified" but has no source — must be counted as unverified.
        dtiCap: { value: 6, asAt: null, sourceUrl: null, confidence: "high", status: "verified" },
      },
    } as Partial<LenderPolicy> & { id: string; name: string });
    const row = policyToRow(policy, TODAY);
    expect(row.fields_total).toBe(1);
    expect(row.fields_verified).toBe(0);
    expect(row.fields_unverified).toBe(1);
  });
});
