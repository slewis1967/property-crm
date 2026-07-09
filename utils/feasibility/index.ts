/**
 * Feasibility engine — public surface.
 *
 * `computeFeasibility` does the maths; `feasibilityToPromptBlock` renders the
 * result into an authoritative block the AI report uses verbatim (so the LLM
 * never does the arithmetic — it just narrates the computed figures).
 */

import type { FeasibilityResult } from "./types";

export { computeFeasibility } from "./engine";
export { inferDensity, defaultAssumptions } from "./assumptions";
export type {
  FeasibilityResult,
  FeasibilityAssumptions,
  Scenario,
  EnvelopeEstimate,
  Financials,
  DensityClass,
} from "./types";

function money(n: number | null | undefined): string {
  if (n == null) return "n/a";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export function feasibilityToPromptBlock(f: FeasibilityResult): string {
  if (!f.envelope || f.coverage === "none") {
    return `COMPUTED FEASIBILITY: not available (${f.notes[0] ?? "insufficient site data"}).`;
  }
  const e = f.envelope;
  const lines: string[] = [
    `COMPUTED FEASIBILITY (deterministic — computed in code from the authoritative site data; use these numbers verbatim, do NOT recalculate):`,
    `- Density class: ${f.densityClass}`,
    `- Site area: ${e.siteAreaSqm.toLocaleString()} m²; estimated storeys: ${e.storeys}; footprint (at ${Math.round(f.assumptions.siteCoverage * 100)}% coverage): ${e.footprintSqm.toLocaleString()} m²`,
    `- Developable GFA: ~${e.developableGfaSqm.toLocaleString()} m² (${e.bindingConstraint === "FSR" ? "FSR-limited" : "height/coverage-limited"}${e.fsrCapGfaSqm != null ? `; FSR cap ${e.fsrCapGfaSqm.toLocaleString()} m²` : ""})`,
  ];
  for (const s of f.scenarios) {
    const fin = s.financials;
    const finBit = fin
      ? ` | GRV ~${money(fin.grossRealisation)}, build ~${money(fin.constructionCost)}${fin.marginOnCostPct != null ? `, margin ~${fin.marginOnCostPct}% on cost` : " (land cost unknown → margin n/a)"}`
      : "";
    lines.push(
      `- Scenario "${s.label}": ${s.feasible ? "feasible" : "not viable"}, yield ${s.yield ?? "n/a"}. ${s.detail}${finBit}`,
    );
  }
  lines.push(
    `Assumptions used — build $${f.assumptions.constructionCostPerSqm}/m², sale $${f.assumptions.salePricePerSqmGfa}/m² GFA (INDICATIVE placeholders), fees ${Math.round(f.assumptions.professionalFeesPct * 100)}%, contingency ${Math.round(f.assumptions.contingencyPct * 100)}%.`,
    `Caveats: ${f.notes.join(" ")}`,
    `Present these as an indicative feasibility/yield section and state clearly that build cost must be confirmed by quote and sale values by comparable sales.`,
  );
  return lines.join("\n");
}
