/**
 * Deterministic feasibility / yield engine (Phase 2).
 *
 * computeFeasibility(site, overrides) → envelope + scenarios (subdivision,
 * dual occupancy, multi-dwelling) + indicative financials. Pure and synchronous.
 *
 * Method (quick desktop feaso):
 *   storeys      = floor(heightLimit / storeyHeight)         [or density default]
 *   footprint    = siteArea × siteCoverage
 *   envelope GFA = footprint × storeys × efficiency
 *   developable  = min(envelope GFA, FSR × siteArea)          [FSR binds if present]
 *   dwellings    = floor(developable GFA / avgDwellingGfa)
 *   lots         = floor(siteArea / minLotSize)               [subdivision]
 *
 * Financials are indicative and only computed where a construction basis exists;
 * profit/margin require a land cost (else left null).
 */

import type { SiteData } from "../planning/types";
import { defaultAssumptions, inferDensity } from "./assumptions";
import { computeFinancials, round } from "./finance";
import type {
  EnvelopeEstimate,
  FeasibilityAssumptions,
  FeasibilityResult,
  Scenario,
} from "./types";

export function computeFeasibility(
  site: SiteData,
  overrides: Partial<FeasibilityAssumptions> = {},
): FeasibilityResult {
  const density = inferDensity(site.controls);
  const assumptions = defaultAssumptions(density, overrides);
  const notes: string[] = [];
  const highlights: Array<{ label: string; value: string }> = [];

  const siteArea = site.parcel?.areaSqm ?? null;
  const controls = site.controls;

  if (siteArea == null) {
    return {
      coverage: "none",
      densityClass: density,
      envelope: null,
      scenarios: [],
      assumptions,
      highlights,
      notes: ["Site area is unknown, so no yield or envelope could be computed."],
    };
  }
  if (site.parcel?.areaEstimated) {
    notes.push("Site area is estimated from the parcel geometry, not an authoritative title area.");
  }

  // Envelope.
  const storeys =
    controls?.heightLimitM != null
      ? Math.max(1, Math.floor(controls.heightLimitM / assumptions.storeyHeightM))
      : assumptions.defaultStoreys;
  const footprintSqm = round(siteArea * assumptions.siteCoverage);
  const maxGfaEnvelopeSqm = round(footprintSqm * storeys * assumptions.efficiency);
  const fsrCapGfaSqm = controls?.fsr != null ? round(controls.fsr * siteArea) : null;
  const developableGfaSqm =
    fsrCapGfaSqm != null ? Math.min(maxGfaEnvelopeSqm, fsrCapGfaSqm) : maxGfaEnvelopeSqm;
  const bindingConstraint: EnvelopeEstimate["bindingConstraint"] =
    fsrCapGfaSqm != null && fsrCapGfaSqm < maxGfaEnvelopeSqm ? "FSR" : "height/coverage";

  const envelope: EnvelopeEstimate = {
    siteAreaSqm: round(siteArea),
    storeys,
    footprintSqm,
    maxGfaEnvelopeSqm,
    fsrCapGfaSqm,
    developableGfaSqm,
    bindingConstraint,
  };

  const scenarios: Scenario[] = [];

  // 1) Subdivision (vacant lots) — needs a minimum lot size.
  const minLot = controls?.minLotSizeSqm ?? null;
  if (minLot != null && minLot > 0) {
    const lots = Math.floor(siteArea / minLot);
    scenarios.push({
      key: "subdivision",
      label: "Torrens / freehold subdivision",
      feasible: lots >= 2,
      yield: lots,
      detail:
        lots >= 2
          ? `Site area ${round(siteArea)} m² ÷ ${minLot} m² minimum ≈ ${lots} lots (before allowing for access handles, road widening or corner truncations — a battle-axe or new road reduces the net yield).`
          : `Site area ${round(siteArea)} m² is below 2 × the ${minLot} m² minimum, so a standard subdivision is not achievable — consider dual occupancy or an additional dwelling instead.`,
      financials: null,
    });
  } else {
    notes.push(
      "No minimum-lot-size control was resolved, so subdivision lot yield could not be computed from data (check the local scheme).",
    );
  }

  // 2) Dual occupancy — low/medium density on a large-enough lot.
  if ((density === "low" || density === "medium" || density === "unknown") && siteArea >= assumptions.dualOccMinSqm) {
    const dualGfa = Math.min(developableGfaSqm, 2 * assumptions.avgDwellingGfaSqm);
    scenarios.push({
      key: "dual_occupancy",
      label: "Dual occupancy (duplex / two dwellings)",
      feasible: true,
      yield: 2,
      detail: `At ${round(siteArea)} m² a two-dwelling development is typically testable in this density. Indicative on ~${round(dualGfa)} m² of GFA; confirm the scheme's dual-occupancy pathway and minimum lot/frontage.`,
      financials: computeFinancials(2, dualGfa, assumptions),
    });
  }

  // 3) Multi-dwelling redevelopment — GFA-driven, but only where the zone
  //    actually permits attached/multi-unit housing. Low-density and rural
  //    zones generally allow just a dwelling house (+ dual occ / secondary
  //    dwelling), so a GFA-based townhouse count would overstate the yield.
  const multiDwellingZone =
    density === "medium" || density === "high" || density === "commercial" || density === "unknown";
  const dwellings = Math.max(0, Math.floor(developableGfaSqm / assumptions.avgDwellingGfaSqm));
  if (multiDwellingZone && dwellings >= 1) {
    scenarios.push({
      key: "multi_dwelling",
      label: "Multi-dwelling redevelopment",
      feasible: dwellings >= 2,
      yield: dwellings,
      detail: `~${round(developableGfaSqm)} m² developable GFA (${bindingConstraint === "FSR" ? "FSR-limited" : "height/coverage-limited"}, ${storeys} storeys) ÷ ~${assumptions.avgDwellingGfaSqm} m²/dwelling ≈ ${dwellings} dwellings.`,
      financials: computeFinancials(Math.max(1, dwellings), developableGfaSqm, assumptions),
    });
  } else if (!multiDwellingZone) {
    notes.push(
      `${density === "rural" ? "Rural" : "Low-density"} zoning generally permits a dwelling house (plus a dual occupancy or secondary dwelling subject to the scheme), not attached multi-dwelling housing — yield is capped accordingly regardless of the building envelope.`,
    );
  }

  // Highlights (for keyStats-style display).
  highlights.push({ label: "Site area", value: `${round(siteArea).toLocaleString()} m²` });
  highlights.push({ label: "Est. storeys", value: `${storeys}` });
  highlights.push({ label: "Developable GFA", value: `~${round(developableGfaSqm).toLocaleString()} m²` });
  if (minLot != null) {
    const lots = Math.floor(siteArea / minLot);
    highlights.push({ label: "Subdivision", value: lots >= 2 ? `~${lots} lots` : "Not viable" });
  } else if (multiDwellingZone && dwellings >= 1) {
    highlights.push({ label: "Dwelling yield", value: `~${dwellings}` });
  } else if (siteArea >= assumptions.dualOccMinSqm) {
    highlights.push({ label: "Yield", value: "Dual occ / 2 dwellings" });
  }

  // Coverage: "full" when we had zone + a numeric control to bind the envelope.
  const hadNumeric = controls?.heightLimitM != null || controls?.fsr != null || minLot != null;
  const coverage: FeasibilityResult["coverage"] = hadNumeric
    ? "full"
    : controls?.zoneCode
      ? "partial"
      : "partial";

  notes.push(
    "Envelope is approximated from a density-based site-coverage ratio (setbacks implied), not a geometric setback offset — the true envelope follows in the 3D stage.",
    "All dollar figures are indicative and depend on the assumptions used; replace build cost with a quote and sale rates with comparable sales before relying on any number.",
  );

  return { coverage, densityClass: density, envelope, scenarios, assumptions, highlights, notes };
}
