import { describe, expect, it } from "vitest";
import PACK from "./pack.generated";
import { brisbaneToday, hydratePolicy, policyFacts } from "./index";
import { verifyPolicy } from "./verify";
import {
  CONFIDENCE_LEVELS,
  FACT_STATUSES,
  INCOME_TYPES,
  LENDER_STATUSES,
  LENDER_TIERS,
  RESIDENCY_STATUSES,
  type IncomeTypeRule,
  type LenderPolicy,
  type ResidencyRule,
} from "./types";

/**
 * Integrity of the committed research pack.
 *
 * These are guards against a future research tranche committing something the
 * runtime would only fail on quietly — a tier the UI can't label, an income
 * type the matcher will never find a rule for, a duplicate id that silently
 * shadows a real lender. The pack is written by AI agents, so "it parsed" is
 * not a high enough bar to merge on.
 *
 * Note what is deliberately NOT asserted: that facts are well-sourced.
 * verify.ts already demotes an unsourced fact at runtime and the engine
 * refuses it, so a thin or badly-sourced record is safe — it just doesn't
 * match. Failing the build over it would push a researcher toward inventing
 * provenance to get green, which is the exact behaviour this system exists to
 * prevent.
 */

const policies = PACK.map((p) => hydratePolicy(p as Partial<LenderPolicy> & { id: string; name: string }));
const TODAY = brisbaneToday();

describe("committed lender research pack", () => {
  it("has records", () => {
    expect(policies.length).toBeGreaterThan(0);
  });

  it("has unique, slug-shaped ids", () => {
    const ids = policies.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id, `bad id: ${id}`).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });

  it("names every lender", () => {
    for (const p of policies) expect(p.name.trim(), p.id).not.toBe("");
  });

  it("uses only known tiers and statuses", () => {
    for (const p of policies) {
      expect(LENDER_TIERS, `${p.id} tier`).toContain(p.tier);
      expect(LENDER_STATUSES, `${p.id} status`).toContain(p.status);
    }
  });

  it("uses only known confidence levels and fact statuses", () => {
    for (const p of policies) {
      for (const [path, fact] of policyFacts(p)) {
        expect(CONFIDENCE_LEVELS, `${p.id} ${path} confidence`).toContain(fact.confidence);
        expect(FACT_STATUSES, `${p.id} ${path} status`).toContain(fact.status);
      }
    }
  });

  it("uses only known income types in income.rules", () => {
    for (const p of policies) {
      const rules = p.income?.rules?.value as IncomeTypeRule[] | null | undefined;
      if (!Array.isArray(rules)) continue;
      for (const rule of rules) {
        expect(INCOME_TYPES, `${p.id} income rule`).toContain(rule.type);
        if (rule.shadingPct !== null && rule.shadingPct !== undefined) {
          expect(rule.shadingPct, `${p.id} ${rule.type} shading`).toBeGreaterThanOrEqual(0);
          expect(rule.shadingPct, `${p.id} ${rule.type} shading`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("uses only known residency statuses in residency.rules", () => {
    for (const p of policies) {
      const rules = p.residency?.rules?.value as ResidencyRule[] | null | undefined;
      if (!Array.isArray(rules)) continue;
      for (const rule of rules) {
        expect(RESIDENCY_STATUSES, `${p.id} residency rule`).toContain(rule.status);
      }
    }
  });

  it("verifies without throwing, and yields some usable policy overall", () => {
    let verified = 0;
    for (const p of policies) {
      const { counts } = verifyPolicy(p, TODAY);
      verified += counts.verified + counts.humanConfirmed;
    }
    // If the whole pack verifies to nothing, the research pipeline or the
    // verification rules have broken — the matcher would silently return
    // "insufficient data" for every lender.
    expect(verified).toBeGreaterThan(0);
  });
});
