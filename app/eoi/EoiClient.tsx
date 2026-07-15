"use client";

/**
 * Expression of Interest — list view. Create a blank EOI, or open/delete an
 * existing one. Deep link `/eoi?property=<id>&contact=<id>&opportunity=<id>`
 * auto-creates a prefilled EOI and opens it (used by the property + opportunity
 * "Create EOI" buttons). The form itself lives at /eoi/[id].
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { EOI_STATUSES, formatEoiPrice } from "../../utils/eoi";

const TEAL = "#0F4C5C";

type EoiRow = {
  id: string;
  summary: string | null;
  status: string;
  purchase_price: number | null;
  aml_case_id: string | null;
  licence_uploaded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_COLOR: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700",
  Sent: "bg-amber-100 text-amber-800",
  Signed: "bg-emerald-100 text-emerald-800",
};

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function EoiClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<EoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | string>("all");
  const deepLinkFired = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eois").then((r) => r.json());
        if (cancelled) return;
        if (!res.ok) throw new Error(res.error || "Load failed");
        setRows(res.eois ?? []);
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

  // Deep link: auto-create a prefilled EOI from a property / contact / opportunity.
  useEffect(() => {
    const property = searchParams.get("property");
    const contact = searchParams.get("contact");
    const opportunity = searchParams.get("opportunity");
    if ((!property && !contact && !opportunity) || deepLinkFired.current) return;
    deepLinkFired.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eois", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId: property, contactId: contact, opportunityId: opportunity }),
        });
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error || "Create failed");
        router.replace(`/eoi/${json.id}`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Create failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  async function onCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/eois", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Create failed");
      router.push(`/eoi/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setCreating(false);
    }
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Delete the EOI for ${label || "this buyer"}? This can't be undone.`)) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    try {
      const res = await fetch(`/api/eois/${id}`, { method: "DELETE" });
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
            Expressions of Interest
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Prepopulated from property + buyer data, sent for e-signing with a driver&apos;s licence attached.
          </p>
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition"
          style={{ backgroundColor: TEAL }}
        >
          {creating ? "Creating…" : "+ New EOI"}
        </button>
      </div>

      {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      <div className="mt-5 flex gap-2 flex-wrap">
        {(["all", ...EOI_STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
              filter === s ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
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
          <p className="text-gray-600">{rows.length === 0 ? "No EOIs yet." : `No EOIs with status “${filter}”.`}</p>
          {rows.length === 0 && (
            <p className="text-xs text-gray-500 mt-2">
              Create one from a property or opportunity, or click <strong>New EOI</strong>. If saving fails, run{" "}
              <code className="px-1 bg-gray-100 rounded">migrations/20260715_eois.sql</code> in Supabase.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Buyer / property</th>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-right font-semibold px-4 py-3">Price</th>
                <th className="text-left font-semibold px-4 py-3">Licence</th>
                <th className="text-left font-semibold px-4 py-3">CDD</th>
                <th className="text-left font-semibold px-4 py-3">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/eoi/${r.id}`} className="font-semibold hover:underline" style={{ color: TEAL }}>
                      {r.summary || "Untitled EOI"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLOR[r.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatEoiPrice(r.purchase_price)}</td>
                  <td className="px-4 py-3 text-xs">{r.licence_uploaded_at ? <span className="text-emerald-700">✓ Attached</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-xs">{r.aml_case_id ? <span className="text-emerald-700">Linked</span> : <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">{when(r.updated_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onDelete(r.id, r.summary ?? "")} className="text-xs text-red-600 hover:text-red-800 hover:underline">
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
