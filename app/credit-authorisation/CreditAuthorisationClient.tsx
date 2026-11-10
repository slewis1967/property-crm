"use client";

/**
 * Credit File Authorisation — list view. Create a new authorisation, or
 * open/delete an existing one. The form itself lives at
 * /credit-authorisation/[id].
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CREDIT_AUTHORISATION_STATUSES } from "../../utils/creditAuthorisation";

const TEAL = "#0F4C5C";

type CreditAuthorisationRow = {
  id: string;
  names: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  signed: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  signed: "Signed",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function CreditAuthorisationClient() {
  const router = useRouter();
  const [rows, setRows] = useState<CreditAuthorisationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | string>("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/credit-authorisations");
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Load failed");
        if (!cancelled) setRows(json.creditAuthorisations ?? []);
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
      const res = await fetch("/api/credit-authorisations", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Create failed");
      router.push(`/credit-authorisation/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Delete the credit authorisation for ${label || "this applicant"}? This can't be undone.`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/credit-authorisations/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
    } catch (e) {
      setRows(prev); // roll back
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const visible = filter === "all" ? rows : rows.filter((r) => r.status === filter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Credit File Authorisation
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Equifax Access Seeker privacy consent. Capture the applicant&apos;s name and address, then print to sign.
          </p>
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition"
          style={{ backgroundColor: TEAL }}
        >
          {creating ? "Creating…" : "+ New authorisation"}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
      )}

      <div className="mt-5 flex gap-2 flex-wrap">
        {(["all", ...CREDIT_AUTHORISATION_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              filter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
            }`}
          >
            {s === "all"
              ? `All (${rows.length})`
              : `${STATUS_LABEL[s] ?? s} (${rows.filter((r) => r.status === s).length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="mt-8 p-8 rounded-xl border border-dashed border-gray-300 text-center">
          <p className="text-gray-600">
            {rows.length === 0 ? "No credit authorisations yet." : `No authorisations with status “${STATUS_LABEL[filter] ?? filter}”.`}
          </p>
          {rows.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Click <strong>New authorisation</strong> to start one. If saving fails, run{" "}
              <code className="px-1 bg-gray-100 rounded">migrations/20260710_credit_authorisations.sql</code> in Supabase.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Applicant(s)</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/credit-authorisation/${r.id}`}
                      className="font-semibold hover:underline"
                      style={{ color: TEAL }}
                    >
                      {r.names || "Untitled authorisation"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{when(r.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onDelete(r.id, r.names ?? "")}
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
