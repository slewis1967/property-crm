/**
 * Density classification + default assumptions for the feasibility engine.
 *
 * The density class is inferred from the planning controls (zone description /
 * code) and drives the per-density defaults (coverage, dwelling size, build
 * cost, indicative sale rate). Costs are AU 2026 order-of-magnitude figures and
 * are DELIBERATELY conservative placeholders — the advisor overrides them with
 * real build quotes and local comps. Sale rates especially vary by location and
 * must be replaced with comparable sales before any figure is relied upon.
 */

import type { PlanningControls } from "../planning/types";
import type { DensityClass, FeasibilityAssumptions } from "./types";

/** Infer a density class from the zone description/code (best-effort, AU-wide). */
export function inferDensity(controls: PlanningControls | null): DensityClass {
  const hay = `${controls?.zoneDescription ?? ""} ${controls?.zoneCode ?? ""} ${controls?.landUse ?? ""}`.toLowerCase();
  if (!hay.trim()) return "unknown";

  if (/\b(ru\d?|rural|farming|primary production|environmental|conservation|green wedge)\b/.test(hay))
    return "rural";
  if (/\b(commercial|business|industrial|mixed use|centre|enterprise|c\dz|in\dz|b\dz|e\d)\b/.test(hay))
    return "commercial";
  if (/high\s*density|residential growth|r4|high-rise|apartment|rgz/.test(hay)) return "high";
  if (/medium\s*density|general residential|r3|r1\b|townhouse|grz|muz/.test(hay)) return "medium";
  if (/low\s*density|large lot|r2|nrz|ldrz|rz1|character/.test(hay)) return "low";

  // Fallbacks: a plain "residential" with no qualifier → treat as low-medium.
  if (/resid/.test(hay)) return "low";
  return "unknown";
}

type DensityDefaults = Pick<
  FeasibilityAssumptions,
  | "siteCoverage"
  | "efficiency"
  | "defaultStoreys"
  | "avgDwellingGfaSqm"
  | "constructionCostPerSqm"
  | "salePricePerSqmGfa"
>;

const BY_DENSITY: Record<DensityClass, DensityDefaults> = {
  low: {
    siteCoverage: 0.5,
    efficiency: 0.9,
    defaultStoreys: 2,
    avgDwellingGfaSqm: 220,
    constructionCostPerSqm: 2600,
    salePricePerSqmGfa: 5500,
  },
  medium: {
    siteCoverage: 0.55,
    efficiency: 0.85,
    defaultStoreys: 3,
    avgDwellingGfaSqm: 140,
    constructionCostPerSqm: 3300,
    salePricePerSqmGfa: 6800,
  },
  high: {
    siteCoverage: 0.6,
    efficiency: 0.78,
    defaultStoreys: 6,
    avgDwellingGfaSqm: 95,
    constructionCostPerSqm: 4300,
    salePricePerSqmGfa: 9500,
  },
  rural: {
    siteCoverage: 0.1,
    efficiency: 0.9,
    defaultStoreys: 1,
    avgDwellingGfaSqm: 250,
    constructionCostPerSqm: 2800,
    salePricePerSqmGfa: 5000,
  },
  commercial: {
    siteCoverage: 0.6,
    efficiency: 0.8,
    defaultStoreys: 3,
    avgDwellingGfaSqm: 120,
    constructionCostPerSqm: 3600,
    salePricePerSqmGfa: 7000,
  },
  unknown: {
    siteCoverage: 0.5,
    efficiency: 0.85,
    defaultStoreys: 2,
    avgDwellingGfaSqm: 150,
    constructionCostPerSqm: 3200,
    salePricePerSqmGfa: 6000,
  },
};

/** Build the default assumption set for a density, merged with any overrides. */
export function defaultAssumptions(
  density: DensityClass,
  overrides: Partial<FeasibilityAssumptions> = {},
): FeasibilityAssumptions {
  const d = BY_DENSITY[density];
  return {
    storeyHeightM: 3.1,
    siteCoverage: d.siteCoverage,
    efficiency: d.efficiency,
    defaultStoreys: d.defaultStoreys,
    avgDwellingGfaSqm: d.avgDwellingGfaSqm,
    constructionCostPerSqm: d.constructionCostPerSqm,
    salePricePerSqmGfa: d.salePricePerSqmGfa,
    professionalFeesPct: 0.12,
    contingencyPct: 0.07,
    dualOccMinSqm: 600,
    landAcquisitionCost: null,
    salePricePerDwelling: null,
    ...overrides,
  };
}
