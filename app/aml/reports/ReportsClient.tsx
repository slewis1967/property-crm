"use client";

/**
 * AUSTRAC reports — SMR / TTR / IFTI. Create a report (the statutory due date is
 * computed from the trigger date), track its status, and mark it lodged with its
 * AUSTRAC receipt. SMRs are confidential: the tipping-off offence means the
 * client must never be told one exists.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { REPORT_TYPES, reportDueDate, daysUntil, type ReportType } from "../../../utils/aml";

const TEAL = "#0F4C5C";
const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500";

type ReportRow = {
  id: string;
  report_type: string;
  status: string;
  subject_name: string | null;
  trigger_date: string | null;
  due_date: string | null;
  terrorism_related: boolean;
  confidential: boolean;
  austrac_reference: string | null;
  lodged_at: string | null;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready: "bg-amber-100 text-amber-800",
  lodged: "bg-emerald-100 text-emerald-800",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsClient() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [withheld, setWithheld] = useState(0);

  const [rType, setRType] = useState<ReportType>("SMR");
  const [subject, setSubject] = useState("");
  const [trigger, setTrigger] = useState(today());
  const [terrorism, setTerrorism] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/aml/reports").then((r) => r.json());
      if (!res.ok) throw new Error(res.error || "Load failed");
      setRows(res.reports ?? []);
      setWithheld(Number(res.withheld) || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Awaited inside an IIFE so setState lands post-await (avoids the
    // cascading-render lint from a bare synchronous call).
    (async () => {
      await load();
    })();
  }, [load]);

  async function onCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/aml/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType: rType, subjectName: subject, triggerDate: trigger, terrorismRelated: rType === "SMR" && terrorism }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Create failed");
      setSubject("");
      setTerrorism(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  async function markLodged(id: string) {
    const ref = window.prompt("Enter the AUSTRAC lodgement reference:");
    if (!ref) return;
    try {
      const res = await fetch(`/api/aml/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "lodged", austracReference: ref }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this report? (Lodged reports can't be deleted.)")) return;
    try {
      const res = await fetch(`/api/aml/reports/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
      setRows((r) => r.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const meta = REPORT_TYPES.find((r) => r.code === rType);
  const previewDue = reportDueDate(rType, trigger, rType === "SMR" && terrorism);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/aml" className="text-xs text-gray-500 hover:underline">
        ← Back to AML
      </Link>
      <h1 className="text-2xl font-bold mt-1" style={{ color: TEAL }}>
        AUSTRAC Reports
      </h1>
      <p className="text-sm text-gray-600 mt-1">
        Suspicious Matter (SMR), Threshold Transaction (TTR) and International Funds Transfer (IFTI) reports.
      </p>

      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <strong>Tipping-off:</strong> never tell a client — or anyone outside the reporting line — that an SMR has been or
        may be lodged. Doing so is a criminal offence. Suspicious Matter Reports are restricted:
        they are visible only to the compliance officer, the person who lodged them, and anyone
        added to the SMR access list on the Program page.
      </div>

      {withheld > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-700">
          {withheld} confidential report{withheld === 1 ? " is" : "s are"} hidden from this list
          because you are not on the SMR access list. Ask the compliance officer if you need access.
        </div>
      )}

      {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      {/* Create */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-bold text-gray-800 mb-3">New report</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Type</span>
            <select className={inputCls} value={rType} onChange={(e) => setRType(e.target.value as ReportType)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Subject</span>
            <input className={inputCls} placeholder="Party / transaction" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1">Trigger date</span>
            <input type="date" className={inputCls} value={trigger} onChange={(e) => setTrigger(e.target.value)} />
          </label>
          <div className="flex flex-col justify-end">
            <button onClick={onCreate} disabled={creating} className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: TEAL }}>
              {creating ? "Creating…" : "+ Create report"}
            </button>
          </div>
        </div>
        {rType === "SMR" && (
          <label className="flex items-center gap-2 text-sm text-gray-700 mt-3">
            <input type="checkbox" checked={terrorism} onChange={(e) => setTerrorism(e.target.checked)} />
            Terrorism-related (24-hour deadline)
          </label>
        )}
        {meta && (
          <p className="text-xs text-gray-500 mt-2">
            {meta.trigger}. Statutory deadline: due <strong>{previewDue}</strong>{" "}
            ({rType === "SMR" && terrorism ? "within 24 hours" : `${meta.deadlineBusinessDays} business days`}).
          </p>
        )}
      </div>

      {/* List */}
      {loading ? (
        <p className="mt-8 text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8 p-8 rounded-xl border border-dashed border-gray-300 text-center">
          <p className="text-gray-600">No reports yet.</p>
          <p className="text-xs text-gray-500 mt-2">
            If saving fails, run <code className="px-1 bg-gray-100 rounded">migrations/20260715_aml.sql</code> in Supabase.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Type</th>
                <th className="text-left font-semibold px-4 py-3">Subject</th>
                <th className="text-left font-semibold px-4 py-3">Trigger</th>
                <th className="text-left font-semibold px-4 py-3">Due</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const overdue = r.status !== "lodged" && r.due_date ? daysUntil(r.due_date) < 0 : false;
                return (
                  <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-semibold" style={{ color: TEAL }}>
                        {r.report_type}
                      </span>
                      {r.confidential && <span className="ml-2 text-[10px] font-semibold uppercase text-red-600">confidential</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.subject_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{r.trigger_date || "—"}</td>
                    <td className={`px-4 py-3 ${overdue ? "text-red-700 font-semibold" : "text-gray-600"}`}>
                      {r.due_date || "—"}
                      {overdue && " (overdue)"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {r.status}
                        {r.status === "lodged" && r.austrac_reference ? ` · ${r.austrac_reference}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status !== "lodged" && (
                        <>
                          <button onClick={() => markLodged(r.id)} className="text-xs font-semibold mr-3 hover:underline" style={{ color: TEAL }}>
                            Mark lodged
                          </button>
                          <button onClick={() => onDelete(r.id)} className="text-xs text-red-600 hover:underline">
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
