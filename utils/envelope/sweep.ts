/**
 * Massing option sweep (Phase 4).
 *
 * The honest version of Archistar's "hundreds of schemes": a bounded
 * generate-and-rank over the parameters that actually move the envelope —
 * storey count (up to the height limit) and setback stance (standard vs
 * minimum) — filtered by what the zone's density permits, each option scored on
 * the chosen objective. Pure + synchronous, so it runs client-side in the
 * report with no server round-trip.
 *
 * It is an ENVELOPE/yield explorer: each option is the maximum buildable box for
 * those parameters, not a compliant unit layout.
 */

import type { GeoPolygon, PlanningControls } from "../planning/types";
import type { DensityClass, Financials } from "../feasibility/types";
import { defaultAssumptions } from "../feasibility/assumptions";
import { computeFinancials } from "../feasibility/finance";
import { buildMassing, type MassingModel } from "./geometry";
import { defaultSetbacks, type Setbacks } from "./setbacks";

export type SweepObjective = "yield" | "gfa" | "margin";

export type MassingOption = {
  id: string;
  label: string;
  typology: "house" | "duplex" | "townhouses" | "apartments";
  storeys: number;
  setbackStance: "standard" | "minimum";
  massing: MassingModel;
  gfaSqm: number;
  dwellings: number;
  footprintAreaSqm: number;
  bindingConstraint: "FSR" | "height/coverage";
  financials: Financials;
  score: number;
  rationale: string;
};

function uniqNums(xs: number[]): number[] {
  return [...new Set(xs)].filter((n) => n >= 1);
}

export function generateMassingOptions(opts: {
  geometry: GeoPolygon;
  controls: PlanningControls | null;
  density: DensityClass;
  siteAreaSqm?: number | null;
  objective?: SweepObjective;
  maxOptions?: number;
  assumptions?: Parameters<typeof defaultAssumptions>[1];
}): MassingOption[] {
  const { geometry, controls, density, objective = "yield", maxOptions = 6 } = opts;
  const a = defaultAssumptions(density, opts.assumptions);
  const storeyHeight = a.storeyHeightM;
  const heightLimit = controls?.heightLimitM ?? null;
  const fsr = controls?.fsr ?? null;
  const maxStoreys = heightLimit
    ? Math.max(1, Math.min(20, Math.floor(heightLimit / storeyHeight)))
    : a.defaultStoreys;

  const multiZone =
    density === "medium" || density === "high" || density === "commercial" || density === "unknown";

  const storeyCands = multiZone
    ? uniqNums([maxStoreys, maxStoreys - 1, Math.ceil(maxStoreys / 2), 2]).filter((s) => s <= maxStoreys)
    : uniqNums([Math.min(maxStoreys, 2), 1]);
  if (storeyCands.length === 0) storeyCands.push(1);

  const std = defaultSetbacks(density);
  const stances: { key: "standard" | "minimum"; setbacks: Setbacks }[] = [
    { key: "standard", setbacks: std },
    {
      key: "minimum",
      setbacks: {
        front: Math.min(std.front, 3),
        rear: Math.min(std.rear, 3),
        side: Math.min(std.side, 0.9),
      },
    },
  ];

  const raw: MassingOption[] = [];
  for (const storeys of storeyCands) {
    for (const stance of stances) {
      const heightM = heightLimit ? Math.min(heightLimit, storeys * storeyHeight) : storeys * storeyHeight;
      const massing = buildMassing({
        geometry,
        storeys,
        heightM,
        density,
        siteAreaSqm: opts.siteAreaSqm ?? null,
        setbacks: stance.setbacks,
      });
      if (!massing) continue;
      const area = opts.siteAreaSqm ?? massing.siteAreaSqm ?? 0;
      const grossGfa = massing.footprintAreaSqm * storeys * a.efficiency;
      const fsrCap = fsr != null ? fsr * area : null;
      const gfa = Math.round(fsrCap != null ? Math.min(grossGfa, fsrCap) : grossGfa);
      const bindingConstraint: MassingOption["bindingConstraint"] =
        fsrCap != null && fsrCap < grossGfa ? "FSR" : "height/coverage";

      let dwellings: number;
      let typology: MassingOption["typology"];
      if (multiZone) {
        dwellings = Math.max(1, Math.floor(gfa / a.avgDwellingGfaSqm));
        typology = density === "high" ? "apartments" : "townhouses";
      } else {
        const dualOk = area >= a.dualOccMinSqm;
        dwellings = dualOk ? 2 : 1;
        typology = dwellings === 2 ? "duplex" : "house";
      }

      const financials = computeFinancials(dwellings, gfa, a);
      const score =
        objective === "yield"
          ? dwellings * 1_000_000 + gfa
          : objective === "gfa"
            ? gfa
            : (financials.marginOnCostPct ?? -1e9);

      raw.push({
        id: `${storeys}s-${stance.key}`,
        label: `${storeys}-storey ${typology}${dwellings > 1 && (typology === "townhouses" || typology === "apartments") ? ` ×${dwellings}` : ""}`,
        typology,
        storeys,
        setbackStance: stance.key,
        massing,
        gfaSqm: gfa,
        dwellings,
        footprintAreaSqm: massing.footprintAreaSqm,
        bindingConstraint,
        financials,
        score,
        rationale: `${stance.key === "minimum" ? "Minimum" : "Standard"} setbacks, ${storeys} storey${storeys === 1 ? "" : "s"} — ${bindingConstraint === "FSR" ? "FSR-limited" : "height/coverage-limited"}.`,
      });
    }
  }

  // Dedupe identical outcomes (same yield + GFA), preferring the standard stance.
  const seen = new Map<string, MassingOption>();
  for (const o of raw) {
    const key = `${o.dwellings}|${o.gfaSqm}|${o.storeys}`;
    const existing = seen.get(key);
    if (!existing || (existing.setbackStance === "minimum" && o.setbackStance === "standard")) {
      seen.set(key, o);
    }
  }

  return [...seen.values()].sort((x, y) => y.score - x.score).slice(0, maxOptions);
}
