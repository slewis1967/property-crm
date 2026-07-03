/**
 * Shared financial maths for the feasibility engine and the massing sweep.
 * Kept in one place so both produce identical, indicative numbers.
 */

import type { FeasibilityAssumptions, Financials } from "./types";

export const GST_DIVISOR = 1.1; // indicative: strip GST from GRV as a margin-scheme proxy

export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export function computeFinancials(
  dwellings: number,
  gfaSqm: number,
  a: FeasibilityAssumptions,
): Financials {
  const constructionCost = round(gfaSqm * a.constructionCostPerSqm);
  const professionalFees = round(constructionCost * a.professionalFeesPct);
  const contingency = round(constructionCost * a.contingencyPct);
  const landCost = a.landAcquisitionCost ?? null;
  const buildSide = constructionCost + professionalFees + contingency;
  const totalDevelopmentCost = landCost != null ? round(landCost + buildSide) : null;

  const grossRealisation =
    a.salePricePerDwelling != null
      ? round(dwellings * a.salePricePerDwelling)
      : round(gfaSqm * a.salePricePerSqmGfa);
  const netRealisation = round(grossRealisation / GST_DIVISOR);

  const profit = totalDevelopmentCost != null ? round(netRealisation - totalDevelopmentCost) : null;
  const marginOnCostPct =
    profit != null && totalDevelopmentCost && totalDevelopmentCost > 0
      ? round((profit / totalDevelopmentCost) * 100, 1)
      : null;

  return {
    landCost,
    constructionCost,
    professionalFees,
    contingency,
    totalDevelopmentCost,
    grossRealisation,
    netRealisation,
    profit,
    marginOnCostPct,
    indicative: true,
  };
}
