"use client";

/**
 * AML/CTF — CDD case list + compliance status header. The per-case CDD form
 * lives at /aml/[id]; the program/enrolment and reports live at /aml/program
 * and /aml/reports.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PARTY_TYPES,
  PARTY_TYPE_LABELS,
  AML_CASE_STATUSES,
  officerNotifyDue,
  daysUntil,
  hydrateProgram,
  type PartyType,
  type AmlProgramData,
} from "../../utils/aml";

const TEAL = "#0F4C5C";

type CaseRow = {
  id: string;
  party_name: string | null;
  party_type: string;
  party_role: string;
  status: string;
  risk_rating: string;
  screening_status: string;
  created_at: string;
  updated_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  "In Progress": "bg-blue-100 text-blue-800",
  Screening: "bg-indigo-100 text-indigo-800",
  "Enhanced DD": "bg-amber-100 text-amber-800",
  Cleared: "bg-emerald-100 text-emerald-800",
  Blocked: "bg-red-100 text-red-800",
};

const RISK_COLOR: Record<string, string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

const SCREEN_LABEL: Record<string, string> = {
  pending: "Not screened",
  clear: "Clear",
  potential_match: "Potential match",
  confirmed_match: "Confirmed match",
};
const SCREEN_COLOR: Record<string, string> = {
  pending: "text-gray-500",
  clear: "text-emerald-700",
  potential_match: "text-amber-700",
  confirmed_match: "text-red-700 font-semibold",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AmlClient() {
  const router = useRouter();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [program, setProgram] = useState<AmlProgramData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | string>("all");
  const [newType, setNewType] = useState<PartyType>("individual");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [casesRes, programRes] = await Promise.all([
          fetch("/api/aml/cases").then((r) => r.json()),
          fetch("/api/aml/program").then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (!casesRes.ok) throw new Error(casesRes.error || "Load failed");
        setRows(casesRes.cases ?? []);
        if (programRes.ok) setProgram(hydrateProgram(programRes.program));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/aml/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyType: newType }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Create failed");
      router.push(`/aml/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Delete the CDD case for ${label || "this party"}? This can't be undone.`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/aml/cases/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
    } catch (e) {
      setRows(prev);
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            AML / CTF Compliance
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Customer Due Diligence, screening and reporting under the AUSTRAC AML/CTF regime (in force 1 July 2026).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/aml/program"
            className="px-4 py-2 text-sm font-semibold rounded-lg border transition hover:bg-gray-50"
            style={{ color: TEAL, borderColor: TEAL }}
          >
            Program &amp; enrolment
          </Link>
          <Link
            href="/aml/reports"
            className="px-4 py-2 text-sm font-semibold rounded-lg border transition hover:bg-gray-50"
            style={{ color: TEAL, borderColor: TEAL }}
          >
            Reports
          </Link>
        </div>
      </div>

      <ComplianceBanner program={program} />

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      {/* Create a new CDD case */}
      <div className="mt-5 flex items-center gap-2 flex-wrap rounded-xl border border-gray-200 bg-white p-4">
        <span className="text-sm font-semibold text-gray-700">New CDD case:</span>
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as PartyType)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500"
        >
          {PARTY_TYPES.map((t) => (
            <option key={t} value={t}>
              {PARTY_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition"
          style={{ backgroundColor: TEAL }}
        >
          {creating ? "Creating…" : "+ Start CDD"}
        </button>
      </div>

      <div className="mt-5 flex gap-2 flex-wrap">
        {(["all", ...AML_CASE_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              filter === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {s === "all" ? `All (${rows.length})` : `${s} (${rows.filter((r) => r.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="mt-8 p-8 rounded-xl border border-dashed border-gray-300 text-center">
          <p className="text-gray-600">
            {rows.length === 0 ? "No CDD cases yet." : `No cases with status “${filter}”.`}
          </p>
          {rows.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Start a CDD case for each buyer and seller. If saving fails, run{" "}
              <code className="px-1 bg-gray-100 rounded">migrations/20260715_aml.sql</code> in Supabase.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Party</th>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-left font-semibold px-4 py-3">Role</th>
                <th className="text-left font-semibold px-4 py-3">Risk</th>
                <th className="text-left font-semibold px-4 py-3">Screening</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/aml/${r.id}`} className="font-semibold hover:underline" style={{ color: TEAL }}>
                      {r.party_name || "Unnamed party"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {PARTY_TYPE_LABELS[r.party_type as PartyType] ?? r.party_type}
                  </td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{r.party_role}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                        RISK_COLOR[r.risk_rating] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {r.risk_rating}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${SCREEN_COLOR[r.screening_status] ?? "text-gray-500"}`}>
                    {SCREEN_LABEL[r.screening_status] ?? r.screening_status}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{when(r.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(r.id, r.party_name ?? "")}
                      className="text-xs text-red-600 hover:text-red-800 hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** A compact compliance-status strip: enrolment + officer-notify + review due. */
function ComplianceBanner({ program }: { program: AmlProgramData | null }) {
  if (!program) return null;
  const enrolled = program.enrolment.status === "enrolled";
  const notifyDue = officerNotifyDue(program);
  const notifyDays = notifyDue ? daysUntil(notifyDue) : null;
  const officerSet = Boolean(program.complianceOfficer.name);

  const items: { label: string; value: string; tone: "ok" | "warn" | "bad" }[] = [
    {
      label: "AUSTRAC enrolment",
      value: enrolled ? "Enrolled" : "Not enrolled — due 29 Jul 2026",
      tone: enrolled ? "ok" : "bad",
    },
    {
      label: "Compliance officer",
      value: officerSet ? program.complianceOfficer.name : "Not appointed",
      tone: officerSet ? "ok" : "warn",
    },
    {
      label: "Officer notified to AUSTRAC",
      value: program.enrolment.officerNotifiedAt
        ? "Done"
        : notifyDue
          ? `Due ${notifyDue}${notifyDays !== null && notifyDays < 0 ? " (overdue)" : ""}`
          : "After enrolment",
      tone: program.enrolment.officerNotifiedAt ? "ok" : notifyDays !== null && notifyDays < 0 ? "bad" : "warn",
    },
  ];

  const toneClass = (t: "ok" | "warn" | "bad") =>
    t === "ok"
      ? "text-emerald-700"
      : t === "warn"
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-[11px] uppercase tracking-wide text-gray-500">{it.label}</div>
          <div className={`text-sm font-semibold mt-0.5 ${toneClass(it.tone)}`}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}
