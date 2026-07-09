"use client";

/**
 * OpportunityCalculations — saved War Room calculator scenarios for one
 * opportunity. Lists existing rows, supports adding a new scenario in any
 * of the six calculator types, editing an existing one, deleting, and
 * "save as new" for cheap "what if" branching off an existing scenario.
 *
 * Storage is the public.opportunity_calculations Supabase table; the
 * calculators themselves live in components/WarRoomCalculators.tsx and
 * are re-used as-is via their exported components + onChange callback.
 */

import { useEffect, useMemo, useState } from "react";
import {
  YieldCalculator,
  StampDutyCalculator,
  BorrowingCalculator,
  GrowthCalculator,
  FhgEligibilityCalculator,
  LoanRepaymentCalculator,
  type CalcSnapshot,
} from "../../components/WarRoomCalculators";

type CalcType = "yield" | "stamp_duty" | "borrowing" | "growth" | "fhg" | "repayment";

type Calculation = {
  id: string;
  calculator_type: CalcType;
  name: string;
  inputs: Record<string, any>;
  outputs: Record<string, any> | null;
  created_at: string;
  updated_at: string;
};

const CALC_META: Record<CalcType, { label: string; emoji: string; headline: (out: any) => string }> = {
  yield: {
    label: "Rental yield",
    emoji: "🧮",
    headline: (o) => `${(o?.netYield ?? 0).toFixed(2)}% net`,
  },
  stamp_duty: {
    label: "Stamp duty",
    emoji: "📋",
    headline: (o) => `${fmtCurrency(o?.payable ?? 0)} payable`,
  },
  borrowing: {
    label: "Borrowing capacity",
    emoji: "💰",
    headline: (o) => `${fmtCurrency(o?.maxLoan ?? 0)} max loan`,
  },
  growth: {
    label: "Capital growth",
    emoji: "📈",
    headline: (o) => `${fmtCurrency(o?.in10 ?? 0)} in 10y`,
  },
  fhg: {
    label: "First Home Guarantee",
    emoji: "🛡️",
    headline: (o) => (o?.eligible ? "Eligible" : "Not eligible"),
  },
  repayment: {
    label: "Loan repayments",
    emoji: "🏠",
    headline: (o) => `${fmtCurrency(o?.piMonthly ?? 0)}/mo P&I`,
  },
};

function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);
}

function CalculatorByType({
  type,
  initial,
  onChange,
}: {
  type: CalcType;
  initial?: Record<string, any>;
  onChange: (s: CalcSnapshot) => void;
}) {
  switch (type) {
    case "yield":      return <YieldCalculator initial={initial} onChange={onChange} />;
    case "stamp_duty": return <StampDutyCalculator initial={initial} onChange={onChange} />;
    case "borrowing":  return <BorrowingCalculator initial={initial} onChange={onChange} />;
    case "growth":     return <GrowthCalculator initial={initial} onChange={onChange} />;
    case "fhg":        return <FhgEligibilityCalculator initial={initial} onChange={onChange} />;
    case "repayment":  return <LoanRepaymentCalculator initial={initial} onChange={onChange} />;
  }
}

/**
 * Subset of the lead row that the BorrowingCalculator can pre-fill from.
 * Optional so legacy opportunities (no financial data) just open with the
 * calculator's static defaults like before.
 */
type BorrowingPrefill = {
  annual_income?: number | null;
  partner_annual_income?: number | null;
  dependents_count?: number | null;
  hecs_balance?: number | null;
  existing_savings?: number | null;
};

function borrowingInitialFromLead(lead: BorrowingPrefill | undefined): Record<string, any> | undefined {
  if (!lead) return undefined;
  const has =
    lead.annual_income != null ||
    lead.partner_annual_income != null ||
    lead.dependents_count != null ||
    lead.hecs_balance != null ||
    lead.existing_savings != null;
  if (!has) return undefined;
  return {
    income: lead.annual_income ?? 0,
    partner: lead.partner_annual_income ?? 0,
    dependents: lead.dependents_count ?? 0,
    hasHecs: (lead.hecs_balance ?? 0) > 0,
    // Passing the balance too caps the compulsory repayment — a client with
    // $800 left owing shouldn't be assessed as if they repay $8k a year.
    hecsBalance: lead.hecs_balance ?? 0,
    deposit: lead.existing_savings ?? 0,
  };
}

export default function OpportunityCalculations({
  opportunityId,
  lead,
}: {
  opportunityId: string;
  lead?: BorrowingPrefill;
}) {
  const [calcs, setCalcs] = useState<Calculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [openCalc, setOpenCalc] = useState<{
    type: CalcType;
    existing: Calculation | null;
  } | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/calculations`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Load failed (${res.status})`);
      setCalcs(data.calculations || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [opportunityId]);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this calculation?")) return;
    const prev = calcs;
    setCalcs(c => c.filter(x => x.id !== id));
    try {
      const res = await fetch(`/api/calculations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setCalcs(prev);
      setError("Failed to delete");
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Calculations</h2>
        <button
          onClick={() => setShowTypePicker(true)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition"
        >
          ＋ New scenario
        </button>
      </div>

      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
          {error} <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : calcs.length === 0 ? (
        <p className="text-xs text-gray-400">
          No calculations saved yet. Click "+ New scenario" to run one and save it here.
        </p>
      ) : (
        <div className="space-y-1.5">
          {calcs.map((c) => {
            const meta = CALC_META[c.calculator_type];
            return (
              <button
                key={c.id}
                onClick={() => setOpenCalc({ type: c.calculator_type, existing: c })}
                className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 transition text-left"
              >
                <span className="text-lg">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {meta.label} · {c.outputs ? meta.headline(c.outputs) : "—"}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(c.id); }}
                  className="text-gray-300 hover:text-red-500 text-xs px-2"
                  title="Delete"
                >
                  ✕
                </button>
              </button>
            );
          })}
        </div>
      )}

      {/* Type picker — choose which calculator the new scenario uses */}
      {showTypePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowTypePicker(false)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">New scenario</h3>
              <button onClick={() => setShowTypePicker(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(CALC_META) as CalcType[]).map((t) => {
                const meta = CALC_META[t];
                return (
                  <button
                    key={t}
                    onClick={() => { setOpenCalc({ type: t, existing: null }); setShowTypePicker(false); }}
                    className="flex flex-col items-center gap-1 p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition text-center"
                  >
                    <span className="text-2xl">{meta.emoji}</span>
                    <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Calculator modal */}
      {openCalc && (
        <CalculatorEditor
          type={openCalc.type}
          existing={openCalc.existing}
          opportunityId={opportunityId}
          leadPrefill={openCalc.type === "borrowing" ? borrowingInitialFromLead(lead) : undefined}
          onClose={() => setOpenCalc(null)}
          onSaved={(saved) => {
            setCalcs((prev) => {
              const without = prev.filter((c) => c.id !== saved.id);
              return [saved, ...without];
            });
            setOpenCalc(null);
          }}
        />
      )}
    </div>
  );
}

function CalculatorEditor({
  type,
  existing,
  opportunityId,
  leadPrefill,
  onClose,
  onSaved,
}: {
  type: CalcType;
  existing: Calculation | null;
  opportunityId: string;
  /** Used as `initial` for a brand-new scenario when the lead row has
   *  financial data on it. Existing scenarios always use their own
   *  saved inputs (so a user-edited "what if" isn't blown away). */
  leadPrefill?: Record<string, any>;
  onClose: () => void;
  onSaved: (saved: Calculation) => void;
}) {
  const meta = CALC_META[type];
  const [name, setName] = useState(existing?.name ?? `${meta.label} #1`);
  // Latest snapshot from the calculator's onChange — we hold it here so
  // Save can persist whatever the user has configured at click time.
  const [snapshot, setSnapshot] = useState<CalcSnapshot | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const persist = async (mode: "save" | "save_as_new") => {
    if (!snapshot) return;
    if (!name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    setErr(null);
    try {
      const isUpdate = mode === "save" && !!existing;
      const res = await fetch(
        isUpdate ? `/api/calculations/${existing!.id}` : `/api/opportunities/${opportunityId}/calculations`,
        {
          method: isUpdate ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            calculator_type: type,
            name: name.trim(),
            inputs: snapshot.inputs,
            outputs: snapshot.outputs,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      onSaved(data.calculation);
    } catch (e: any) {
      setErr(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-xl">{meta.emoji}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scenario name"
              className="flex-1 min-w-0 px-2 py-1 text-base font-semibold rounded-md border border-transparent hover:border-gray-200 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none ml-2">✕</button>
        </div>

        <div className="px-6 py-5">
          {!existing && leadPrefill && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800">
              Pre-filled from this opportunity's saved profile (income, partner income,
              dependents, HECS). Adjust below as needed.
            </div>
          )}
          <CalculatorByType
            type={type}
            initial={existing?.inputs ?? leadPrefill}
            onChange={setSnapshot}
          />
          {err && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{err}</div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => persist("save_as_new")}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition"
            >
              Save as new
            </button>
          )}
          <button
            type="button"
            onClick={() => persist("save")}
            disabled={saving}
            className="ml-auto px-5 py-2 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {saving ? "Saving…" : existing ? "Save changes" : "Save scenario"}
          </button>
        </div>
      </div>
    </div>
  );
}
