"use client";

/**
 * Massing explorer (Phase 4).
 *
 * Runs the client-side sweep (generateMassingOptions) over the parcel + controls
 * and lets the advisor flip between ranked development options in the 3D viewer,
 * and re-rank by objective (max yield vs max floor area). Pure/synchronous —
 * no server round-trip. Loaded via next/dynamic({ssr:false}) so three.js stays
 * out of the initial bundle.
 */

import { useMemo, useState } from "react";
import MassingViewer from "./MassingViewer";
import { generateMassingOptions, type SweepObjective } from "../../utils/envelope/sweep";
import type { GeoPolygon, PlanningControls } from "../../utils/planning/types";
import type { DensityClass } from "../../utils/feasibility/types";

function money(n: number | null | undefined): string {
  if (n == null) return "n/a";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}

export default function MassingExplorer({
  geometry,
  controls,
  density,
  siteAreaSqm,
}: {
  geometry: GeoPolygon;
  controls: PlanningControls | null;
  density: DensityClass;
  siteAreaSqm: number | null;
}) {
  const [objective, setObjective] = useState<SweepObjective>("yield");
  const [sel, setSel] = useState(0);

  const options = useMemo(
    () => generateMassingOptions({ geometry, controls, density, siteAreaSqm, objective }),
    [geometry, controls, density, siteAreaSqm, objective],
  );
  if (!options.length) return null;

  const active = options[Math.min(sel, options.length - 1)];
  const m = active.massing;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0F4C5C]">
          Development options ({options.length})
        </span>
        <div className="flex gap-1 text-[11px]">
          <span className="text-gray-400 mr-1 self-center">Rank by</span>
          {(
            [
              ["yield", "Max yield"],
              ["gfa", "Max floor area"],
            ] as [SweepObjective, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setObjective(key);
                setSel(0);
              }}
              className={`px-2 py-0.5 rounded-full border transition ${
                objective === key
                  ? "bg-[#0F4C5C] text-white border-[#0F4C5C]"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Option chips */}
      <div className="flex gap-2 overflow-x-auto px-3 pb-2.5">
        {options.map((o, i) => (
          <button
            key={o.id}
            onClick={() => setSel(i)}
            className={`shrink-0 text-left rounded-lg border px-3 py-2 transition min-w-[140px] ${
              i === sel
                ? "border-[#0F4C5C] bg-[#E0F2F1]"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-semibold text-[#1a2332]">{o.label}</span>
              {i === 0 && (
                <span className="text-[9px] font-bold uppercase bg-[#FFB627] text-[#3a2c00] px-1.5 py-0.5 rounded">
                  Top
                </span>
              )}
            </div>
            <div className="text-[10.5px] text-gray-500 mt-0.5">
              {o.dwellings} dwelling{o.dwellings === 1 ? "" : "s"} · ~{o.gfaSqm.toLocaleString()} m² ·{" "}
              GRV {money(o.financials.grossRealisation)}
            </div>
          </button>
        ))}
      </div>

      <MassingViewer massing={m} />

      <div className="text-[11px] text-gray-500 px-3 py-2 space-y-0.5">
        <div>
          <span className="font-semibold text-[#0F4C5C]">{active.label}</span> — {active.storeys} storey
          {active.storeys === 1 ? "" : "s"} / {Math.round(m.heightM)} m · footprint ~
          {m.footprintAreaSqm.toLocaleString()} m²
          {m.siteAreaSqm ? ` of ${m.siteAreaSqm.toLocaleString()} m²` : ""} · GFA ~
          {active.gfaSqm.toLocaleString()} m² ({active.bindingConstraint}) · GRV{" "}
          {money(active.financials.grossRealisation)}
          {active.financials.marginOnCostPct != null
            ? ` · margin ~${active.financials.marginOnCostPct}% on cost`
            : ""}
          . Setbacks {m.setbacks.front}/{m.setbacks.side}/{m.setbacks.rear} m ({active.setbackStance}).
        </div>
        {m.clamped && (
          <div className="text-amber-700">
            Setbacks exceed the lot at these defaults — footprint shown is nominal.
          </div>
        )}
        <div className="text-gray-400">
          Indicative envelope options (max buildable box after setbacks/height, ranked by the selected
          objective) — an envelope/yield explorer, not compliant designs. Dollar figures depend on the
          assumptions; confirm build cost by quote and sale values by comparable sales.
        </div>
      </div>
    </div>
  );
}
