"use client";

/**
 * Income Check panel on the opportunity detail page.
 *
 * Sits directly under Supporting Documents, because that panel is where the
 * false confidence comes from: fifteen green "Accepted" rows read as a file in
 * good shape, and on the Hallidays every one of them was accurate while the
 * application was being assessed on income nobody had reconciled. This panel
 * answers the question the document list cannot — do the numbers inside those
 * files support what the client declared?
 *
 * Findings come from the background sweep, so the panel is normally just
 * reading state. The Re-check button exists for the moment after someone
 * uploads a replacement and wants an answer now rather than within two hours.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export type IncomeFinding = {
  applicant: string;
  severity: "info" | "warn" | "critical";
  code: string;
  message: string;
  action: string | null;
};

export type IncomeApplicantView = {
  applicant: string;
  declaredAnnual: number | null;
  atoAnnual: number | null;
  atoIsPartYear: boolean;
  payslipAnnual: number | null;
  bestEvidenceAnnual: number | null;
};

export interface IncomeCheckState {
  /** The request row to re-check against. Null when the app has no documents. */
  requestId: string | null;
  status: "pass" | "attention" | null;
  summary: string | null;
  findings: IncomeFinding[];
  applicants: IncomeApplicantView[];
  evaluatedAt: string | null;
  extractedAt: string | null;
}

function money(n: number | null): string {
  return n == null ? "—" : `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

function when(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

const TONE: Record<IncomeFinding["severity"], { dot: string; label: string; row: string }> = {
  critical: { dot: "bg-red-500", label: "text-red-700", row: "border-red-200 bg-red-50" },
  warn: { dot: "bg-amber-500", label: "text-amber-700", row: "border-amber-200 bg-amber-50" },
  info: { dot: "bg-slate-400", label: "text-slate-600", row: "border-slate-200 bg-slate-50" },
};

export default function OpportunityIncomeCheck({ state }: { state: IncomeCheckState }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function recheck() {
    if (!state.requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-requests/${state.requestId}/income-check`, { method: "POST" });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || "Check failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  if (!state.requestId) return null;

  const criticals = state.findings.filter((f) => f.severity === "critical").length;
  const sorted = [...state.findings].sort((a, b) => {
    const rank = { critical: 0, warn: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity];
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Income check
            {state.status === "attention" && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {criticals > 0 ? `${criticals} to resolve` : "needs review"}
              </span>
            )}
            {state.status === "pass" && (
              <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                reconciles
              </span>
            )}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Declared income against what the payslips and ATO statements actually say.
          </p>
        </div>
        <button
          type="button"
          onClick={recheck}
          disabled={busy}
          className="shrink-0 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? "Checking…" : "Re-check"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {!state.evaluatedAt && !busy && (
        <p className="mt-3 text-sm text-slate-500">
          Not checked yet — it runs automatically, or use Re-check.
        </p>
      )}

      {state.summary && <p className="mt-3 text-sm text-slate-700">{state.summary}</p>}

      {state.applicants.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium">Applicant</th>
                <th className="py-1 pr-3 text-right font-medium">Declared</th>
                <th className="py-1 pr-3 text-right font-medium">Payslips</th>
                <th className="py-1 pr-3 text-right font-medium">ATO</th>
              </tr>
            </thead>
            <tbody className="text-slate-800">
              {state.applicants.map((a) => (
                <tr key={a.applicant} className="border-t border-slate-100">
                  <td className="py-1.5 pr-3">{a.applicant}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{money(a.declaredAnnual)}</td>
                  <td className="py-1.5 pr-3 text-right font-medium tabular-nums">{money(a.payslipAnnual)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-500">
                    {money(a.atoAnnual)}
                    {a.atoIsPartYear && (
                      <span
                        className="ml-1 cursor-help text-amber-600"
                        title="Covers part of a year — annualising it understates current earnings"
                      >
                        *
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.applicants.some((a) => a.atoIsPartYear) && (
            <p className="mt-1.5 text-[11px] text-slate-500">
              * part-year statement — annualising it understates what they currently earn.
            </p>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <ul className="mt-3 space-y-2">
          {sorted.map((f, i) => {
            const tone = TONE[f.severity];
            return (
              <li key={`${f.code}-${i}`} className={`rounded border p-2.5 ${tone.row}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs">
                      <span className={`font-semibold ${tone.label}`}>{f.applicant}</span>
                      <span className="text-slate-800"> — {f.message}</span>
                    </p>
                    {f.action && <p className="mt-0.5 text-[11px] text-slate-600">{f.action}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {state.evaluatedAt && (
        <p className="mt-3 text-[11px] text-slate-400">
          Checked {when(state.evaluatedAt)}
          {state.extractedAt && state.extractedAt !== state.evaluatedAt
            ? ` · documents last read ${when(state.extractedAt)}`
            : ""}
        </p>
      )}
    </section>
  );
}
