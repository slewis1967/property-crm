"use client";

/**
 * Indicative borrowing capacity, derived live from the fact find.
 *
 * Read-only and self-contained: it never writes to the fact find. The whole
 * mapping lives in `utils/factfind-capacity.ts`, and everything it can't map is
 * shown rather than hidden — a capacity number whose provenance you can't see
 * is worse than no number.
 *
 * `no-print` because the fact find is a signed document; an indicative estimate
 * has no business inside it.
 */

import { useMemo } from "react";
import type { FactFindData } from "../../../utils/factfind";
import {
  capacityIsMeaningful,
  factFindToCapacityInputs,
  MISSING_FIELD_LABELS,
} from "../../../utils/factfind-capacity";
import { computeCapacity } from "../../../utils/finance";

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);

export default function CapacityPanel({ data }: { data: FactFindData }) {
  const { result, missing, notes, meaningful, hasDeposit } = useMemo(() => {
    const bridge = factFindToCapacityInputs(data);
    const ok = capacityIsMeaningful(bridge.missing);
    return {
      result: ok ? computeCapacity(bridge.inputs) : null,
      missing: bridge.missing,
      notes: bridge.notes,
      meaningful: ok,
      hasDeposit: bridge.inputs.deposit > 0,
    };
  }, [data]);

  return (
    <section className="no-print mt-8 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-gray-800">Indicative borrowing capacity</h2>
        <span className="text-[11px] text-gray-400">from this fact find · not printed</span>
      </div>
      <p className="text-[11px] text-gray-500 mb-4">
        Derived from the income, securities and liabilities captured above. Indicative only — not a
        credit decision, and not part of the signed document.
      </p>

      {!meaningful ? (
        <p className="text-xs text-amber-700">
          Enter a gross annual income for at least one applicant to see a capacity estimate.
        </p>
      ) : (
        result && (
          <>
            <div className="flex flex-wrap gap-6">
              <Figure label="Estimated max loan" value={money(result.maxLoan)} big />
              {/* Without a deposit the "purchase price" is just the loan less duty,
                  which reads as a smaller number than the loan itself. Meaningless
                  — and it would contradict the "no purchase price" note below. */}
              {hasDeposit && result.purchasePrice > 0 && (
                <Figure label="Max purchase price" value={money(result.purchasePrice)} big />
              )}
              <Figure label="Monthly surplus" value={money(result.surplus)} />
              <Figure
                label="Limited by"
                value={result.bindingConstraint === "dti" ? `DTI ${result.dtiAtMax.toFixed(1)}×` : "Servicing"}
              />
            </div>

            {result.portfolioDebt > 0 && (
              <p className="text-[11px] text-gray-500 mt-3">
                Portfolio: {money(result.portfolioDebt)} of mortgage debt,{" "}
                {result.portfolioNetMonthly < 0 ? "costing " : "contributing "}
                {money(Math.abs(result.portfolioNetMonthly))}/mo.
              </p>
            )}
            {hasDeposit && result.depositShortfall > 0 && (
              <p className="text-[11px] text-red-600 mt-2">
                Deposit is {money(result.depositShortfall)} short of stamp duty plus closing costs.
              </p>
            )}
          </>
        )
      )}

      {missing.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-[11px] font-semibold text-gray-600 mb-1">Not captured by the fact find</p>
          <ul className="text-[11px] text-gray-500 space-y-0.5 list-disc pl-4">
            {missing.map((m) => (
              <li key={m}>{MISSING_FIELD_LABELS[m]}</li>
            ))}
          </ul>
        </div>
      )}

      {meaningful && notes.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-semibold text-gray-600 mb-1">Assumptions</p>
          <ul className="text-[11px] text-gray-500 space-y-0.5 list-disc pl-4">
            {notes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Figure({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className={big ? "text-xl font-bold text-gray-900" : "text-sm font-medium text-gray-700"}>
        {value}
      </div>
    </div>
  );
}
