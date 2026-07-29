"use client";

/**
 * Lender Match — a client scenario in, a ranked lender shortlist out, with a
 * defensible pass/fail reason and a source link behind every line.
 *
 * Two things this screen deliberately does that a "which lender" tool usually
 * doesn't:
 *
 *  1. It shows the UNKNOWNS as prominently as the passes. A lender we hold no
 *     credit policy for is listed as "not enough policy data", never as a fit.
 *  2. It shows which of the lender's own servicing parameters were actually
 *     used, and which fell back to generic assumptions — so the estimated max
 *     loan is never mistaken for the lender's own calculator.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  EMPLOYMENT_BASES,
  EMPLOYMENT_BASIS_LABELS,
  LOAN_PURPOSES,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  PURPOSE_LABELS,
  emptyApplicant,
  emptyCredit,
  type EmploymentBasis,
  type LenderScenario,
  type LoanPurpose,
  type ScenarioPropertyType,
} from "../../../utils/lender-policy/scenario";
import { RESIDENCY_STATUSES, TIER_LABELS, type ResidencyStatus } from "../../../utils/lender-policy/types";
import {
  MATCH_OUTCOME_LABELS,
  type LenderMatch,
  type MatchOutcome,
  type MatchRun,
} from "../../../utils/lender-policy/match";
import { CURRENT_TAX_YEAR } from "../../../utils/finance/tax";
import type { CapacityInputs } from "../../../utils/finance/capacity";

const TEAL = "#0F4C5C";

const OUTCOME_CHIP: Record<MatchOutcome, string> = {
  eligible: "bg-emerald-100 text-emerald-800 border-emerald-200",
  refer: "bg-amber-100 text-amber-900 border-amber-200",
  insufficient_data: "bg-gray-100 text-gray-600 border-gray-200",
  ineligible: "bg-red-50 text-red-700 border-red-200",
};

const CHECK_CHIP: Record<string, string> = {
  pass: "text-emerald-700",
  fail: "text-red-700",
  refer: "text-amber-700",
  unknown: "text-gray-500",
};
const CHECK_MARK: Record<string, string> = { pass: "✓", fail: "✕", refer: "!", unknown: "?" };

function baseCapacity(): CapacityInputs {
  return {
    taxYear: CURRENT_TAX_YEAR,
    income: 0,
    partner: 0,
    otherIncome: 0,
    hasHecs: false,
    partnerHasHecs: false,
    claimsStandardDeduction: false,
    dependents: 0,
    declaredExpenses: 0,
    deposit: 0,
    state: "QLD",
    isFhb: false,
    closingCosts: 3000,
    newWeeklyRent: 0,
    newPropertyIsNewBuild: false,
    properties: [],
    creditLimit: 0,
    personalLoan: 0,
    carLoan: 0,
    otherDebts: 0,
    consumerDebtBalance: 0,
    rate: 6,
    buffer: 3,
    loanTerm: 30,
    rentShading: 0.8,
    dtiCap: 6,
    negativeGearing: false,
  };
}

function emptyScenario(): LenderScenario {
  return {
    capacity: baseCapacity(),
    purpose: "purchase_owner_occupied",
    loanAmount: null,
    propertyValue: null,
    applicants: [emptyApplicant("Applicant 1")],
    security: { propertyType: "house", floorAreaSqm: null, postcode: null, highDensity: false },
    credit: emptyCredit(),
    genuineSavings: 0,
    genuineSavingsMonthsHeld: 0,
    giftedDeposit: false,
    guarantorAvailable: false,
    loanTermYears: 30,
    interestOnly: false,
  };
}

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-gray-600">{label}</span>
      {children}
    </label>
  );
}

const INPUT = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";

function MatchCard({ match }: { match: LenderMatch }) {
  const [open, setOpen] = useState(false);
  const fellBack = match.parametersUsed.fellBackTo.length;

  return (
    <div className={`rounded-lg border bg-white ${OUTCOME_CHIP[match.outcome].split(" ").pop()}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-[160px] flex-1">
          <span className="font-medium text-gray-900">{match.lenderName}</span>
          <span className="ml-2 text-xs text-gray-500">{TIER_LABELS[match.tier]}</span>
        </span>
        <span className={`rounded border px-2 py-0.5 text-xs ${OUTCOME_CHIP[match.outcome]}`}>
          {MATCH_OUTCOME_LABELS[match.outcome]}
        </span>
        <span className="w-32 text-right text-sm">
          {match.outcome === "ineligible" ? (
            <span className="text-gray-400">—</span>
          ) : (
            <>
              <span className="font-medium text-gray-900">{money(match.estimatedMaxLoan)}</span>
              <span className="block text-[11px] text-gray-500">
                {match.bindingConstraint ? `by ${match.bindingConstraint}` : ""}
              </span>
            </>
          )}
        </span>
        <span className="w-28 text-right text-[11px] text-gray-500">
          {match.failures.length > 0 && <span className="text-red-700">{match.failures.length} fail </span>}
          {match.referrals.length > 0 && <span className="text-amber-700">{match.referrals.length} refer </span>}
          {match.unknowns.length > 0 && <span>{match.unknowns.length} unknown</span>}
        </span>
      </button>

      {/* The headline reason stays visible collapsed — a broker scanning the
          list needs to know WHY a lender is out without expanding every row. */}
      {!open && match.failures.length > 0 && (
        <p className="px-4 pb-3 text-xs text-red-700">{match.failures[0].reason}</p>
      )}

      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="mb-2 text-xs text-gray-600">
            Assessed on{" "}
            {match.parametersUsed.buffer !== null
              ? `this lender's ${match.parametersUsed.buffer}% buffer`
              : "a generic 3% buffer"}
            {match.parametersUsed.dtiCap !== null
              ? `, DTI cap ${match.parametersUsed.dtiCap}`
              : ", generic DTI cap 6"}
            {fellBack > 0 && (
              <span className="text-amber-700">
                {" "}
                — {fellBack} servicing parameter{fellBack === 1 ? "" : "s"} not published by this
                lender, so generic assumptions were used.
              </span>
            )}
          </div>

          <ul className="space-y-1.5">
            {match.checks.map((c, i) => (
              <li key={`${c.code}-${i}`} className="text-sm">
                <span className={`mr-1.5 font-bold ${CHECK_CHIP[c.outcome]}`}>
                  {CHECK_MARK[c.outcome]}
                </span>
                <span className="text-gray-800">{c.label}</span>
                <span className="text-gray-600"> — {c.reason}</span>
                {c.sourceUrl && (
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1.5 text-xs text-blue-700 underline"
                  >
                    source{c.asAt ? ` (${c.asAt})` : ""}
                  </a>
                )}
              </li>
            ))}
          </ul>

          <Link
            href={`/lenders/${match.lenderId}`}
            className="mt-3 inline-block text-xs text-blue-700 underline"
          >
            Full policy record →
          </Link>
        </div>
      )}
    </div>
  );
}

export default function MatchClient() {
  const searchParams = useSearchParams();
  const factFindId = searchParams.get("factFind");

  const [scenario, setScenario] = useState<LenderScenario>(emptyScenario);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [run, setRun] = useState<MatchRun | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(<K extends keyof LenderScenario>(key: K, value: LenderScenario[K]) => {
    setScenario((s) => ({ ...s, [key]: value }));
  }, []);
  const setCapacity = useCallback((patch: Partial<CapacityInputs>) => {
    setScenario((s) => ({ ...s, capacity: { ...s.capacity, ...patch } }));
  }, []);

  useEffect(() => {
    if (!factFindId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lenders/scenario?factFindId=${encodeURIComponent(factFindId)}`);
        const json = (await res.json()) as {
          ok: boolean;
          scenario?: LenderScenario;
          assumptions?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!json.ok || !json.scenario) throw new Error(json.error ?? "Could not load the fact find");
        setScenario(json.scenario);
        setAssumptions(json.assumptions ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the fact find");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [factFindId]);

  const runMatch = useCallback(async () => {
    setBusy(true);
    setError(null);
    setReason(null);
    try {
      const res = await fetch("/api/lenders/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      const json = (await res.json()) as { ok: boolean; run?: MatchRun | null; reason?: string; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Could not run the match");
      setRun(json.run ?? null);
      setReason(json.reason ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not run the match");
    } finally {
      setBusy(false);
    }
  }, [scenario]);

  const applicant = scenario.applicants[0] ?? emptyApplicant();
  const patchApplicant = (patch: Partial<typeof applicant>) => {
    setScenario((s) => ({
      ...s,
      applicants: [{ ...(s.applicants[0] ?? emptyApplicant()), ...patch }, ...s.applicants.slice(1)],
    }));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/lenders" className="text-sm text-blue-700 underline">
        ← Lender library
      </Link>
      <h1 className="mt-2 text-2xl font-semibold" style={{ color: TEAL }}>
        Lender Match
      </h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Scores a client scenario against every lender on file and ranks them, with the published
        policy — and its source — behind every pass and every knock-out.
      </p>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Internal research aid — not credit advice, and not for the client.</strong> This is a
        broker&apos;s shortlist built from publicly published lender policy, which changes without
        notice. It is not a credit assessment, not a pre-approval and not a recommendation. Only the
        lender can assess the loan; confirm every result against current policy before acting.
      </div>

      {assumptions.length > 0 && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div className="font-medium">
            Confirm these before trusting the shortlist — the fact find has no field for them, so
            they were assumed:
          </div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_1fr]">
        {/* ── Scenario ─────────────────────────────────────────────── */}
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Scenario</h2>

          <Field label="Purpose">
            <select
              className={INPUT}
              value={scenario.purpose}
              onChange={(e) => set("purpose", e.target.value as LoanPurpose)}
            >
              {LOAN_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {PURPOSE_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Loan amount">
              <input
                type="number"
                className={INPUT}
                value={scenario.loanAmount ?? ""}
                onChange={(e) => set("loanAmount", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="Max"
              />
            </Field>
            <Field label="Property value">
              <input
                type="number"
                className={INPUT}
                value={scenario.propertyValue ?? ""}
                onChange={(e) => set("propertyValue", e.target.value === "" ? null : Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Applicant income">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.income || ""}
                onChange={(e) => setCapacity({ income: Number(e.target.value) })}
              />
            </Field>
            <Field label="Partner income">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.partner || ""}
                onChange={(e) => setCapacity({ partner: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Dependents">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.dependents || ""}
                onChange={(e) => setCapacity({ dependents: Number(e.target.value) })}
              />
            </Field>
            <Field label="Living expenses / mo">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.declaredExpenses || ""}
                onChange={(e) => setCapacity({ declaredExpenses: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Deposit">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.deposit || ""}
                onChange={(e) => setCapacity({ deposit: Number(e.target.value) })}
              />
            </Field>
            <Field label="Card limits">
              <input
                type="number"
                className={INPUT}
                value={scenario.capacity.creditLimit || ""}
                onChange={(e) => setCapacity({ creditLimit: Number(e.target.value) })}
              />
            </Field>
          </div>

          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Applicant
          </h2>
          <Field label="Employment basis">
            <select
              className={INPUT}
              value={applicant.employmentBasis}
              onChange={(e) => patchApplicant({ employmentBasis: e.target.value as EmploymentBasis })}
            >
              {EMPLOYMENT_BASES.map((b) => (
                <option key={b} value={b}>
                  {EMPLOYMENT_BASIS_LABELS[b]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Months in role">
              <input
                type="number"
                className={INPUT}
                value={applicant.monthsInCurrentRole ?? ""}
                onChange={(e) =>
                  patchApplicant({
                    monthsInCurrentRole: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Months in industry">
              <input
                type="number"
                className={INPUT}
                value={applicant.monthsInIndustry ?? ""}
                onChange={(e) =>
                  patchApplicant({
                    monthsInIndustry: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
          <Field label="Residency">
            <select
              className={INPUT}
              value={applicant.residency}
              onChange={(e) => patchApplicant({ residency: e.target.value as ResidencyStatus })}
            >
              {RESIDENCY_STATUSES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>

          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Security
          </h2>
          <Field label="Property type">
            <select
              className={INPUT}
              value={scenario.security.propertyType}
              onChange={(e) =>
                set("security", {
                  ...scenario.security,
                  propertyType: e.target.value as ScenarioPropertyType,
                })
              }
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Unit area m²">
              <input
                type="number"
                className={INPUT}
                value={scenario.security.floorAreaSqm ?? ""}
                onChange={(e) =>
                  set("security", {
                    ...scenario.security,
                    floorAreaSqm: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Postcode">
              <input
                className={INPUT}
                value={scenario.security.postcode ?? ""}
                onChange={(e) =>
                  set("security", { ...scenario.security, postcode: e.target.value || null })
                }
              />
            </Field>
          </div>

          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Credit file
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Defaults">
              <input
                type="number"
                className={INPUT}
                value={scenario.credit.defaultsCount || ""}
                onChange={(e) =>
                  set("credit", { ...scenario.credit, defaultsCount: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Default total $">
              <input
                type="number"
                className={INPUT}
                value={scenario.credit.defaultsTotalAmount || ""}
                onChange={(e) =>
                  set("credit", { ...scenario.credit, defaultsTotalAmount: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={scenario.credit.defaultsPaid}
              onChange={(e) => set("credit", { ...scenario.credit, defaultsPaid: e.target.checked })}
            />
            Defaults are paid
          </label>
          <Field label="Genuine savings evidenced">
            <input
              type="number"
              className={INPUT}
              value={scenario.genuineSavings || ""}
              onChange={(e) => set("genuineSavings", Number(e.target.value))}
            />
          </Field>

          <button
            type="button"
            onClick={runMatch}
            disabled={busy}
            className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {busy ? "Matching…" : "Match lenders"}
          </button>
        </div>

        {/* ── Results ──────────────────────────────────────────────── */}
        <div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {reason && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              {reason}
            </div>
          )}

          {run && (
            <>
              <div className="mb-3 flex flex-wrap gap-4 text-sm">
                <span>
                  <strong className="text-emerald-700">{run.summary.eligible}</strong> fit policy
                </span>
                <span>
                  <strong className="text-amber-700">{run.summary.refer}</strong> need an exception
                </span>
                <span>
                  <strong className="text-gray-600">{run.summary.insufficient_data}</strong> not
                  enough policy data
                </span>
                <span>
                  <strong className="text-red-700">{run.summary.ineligible}</strong> ruled out
                </span>
              </div>

              {run.scenarioGaps.length > 0 && (
                <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-700">
                  <div className="font-medium">
                    Checks that could not run because the scenario doesn&apos;t carry the input:
                  </div>
                  <ul className="mt-1 list-inside list-disc">
                    {run.scenarioGaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                {run.matches.map((m) => (
                  <MatchCard key={m.lenderId} match={m} />
                ))}
              </div>

              <p className="mt-6 text-xs text-gray-500">{run.disclaimer}</p>
            </>
          )}

          {!run && !reason && !error && (
            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-16 text-center text-sm text-gray-500">
              Fill in the scenario and run the match.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
