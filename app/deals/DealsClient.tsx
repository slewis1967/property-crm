"use client";

/**
 * Development Watchlist — site opportunities captured from Region Prospecting
 * and Planning Feasibility, tracked through a deal pipeline. Change stage or
 * notes inline; jump back into the feasibility tool for any site.
 */

import { useEffect, useMemo, useState } from "react";
import { DEAL_STAGES, type DealStage } from "../../utils/deals";

const TEAL = "#0F4C5C";

type Deal = {
  id: string;
  source: string;
  address: string | null;
  lot_plan: string | null;
  lga: string | null;
  state: string | null;
  zone_code: string | null;
  area_sqm: number | null;
  est_lots: number | null;
  extra_lots: number | null;
  center: { lng: number; lat: number } | null;
  stage: string;
  notes: string | null;
  created_at: string;
};

const STAGE_COLOR: Record<string, string> = {
  Identified: "bg-gray-100 text-gray-700",
  Researching: "bg-blue-100 text-blue-800",
  "Feasibility done": "bg-indigo-100 text-indigo-800",
  "Owner contact": "bg-amber-100 text-amber-800",
  Pursuing: "bg-emerald-100 text-emerald-800",
  Won: "bg-emerald-600 text-white",
  Passed: "bg-red-100 text-red-700",
};

function feasoHref(d: Deal): string {
  const q = d.address || `${d.lot_plan ?? ""} ${d.lga ?? ""} ${d.state ?? ""}`.trim();
  return `/feasibility?address=${encodeURIComponent(q)}&auto=1`;
}

export default function DealsClient() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | DealStage>("all");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/deals");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load");
      setDeals(json.deals || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function patch(id: string, body: { stage?: string; notes?: string }) {
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, ...body } : d)));
    try {
      await fetch(`/api/deals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      /* optimistic — non-fatal */
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this opportunity from the watchlist?")) return;
    setDeals((ds) => ds.filter((d) => d.id !== id));
    try {
      await fetch(`/api/deals/${id}`, { method: "DELETE" });
    } catch {
      /* non-fatal */
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of deals) c[d.stage] = (c[d.stage] ?? 0) + 1;
    return c;
  }, [deals]);

  const shown = filter === "all" ? deals : deals.filter((d) => d.stage === filter);

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
        Development Watchlist
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        Site opportunities you&apos;ve captured from Region Prospecting and Planning Feasibility. Track
        each through the pipeline and jump back into a full assessment anytime.
      </p>

      {/* Stage filter */}
      <div className="mt-4 flex flex-wrap gap-1.5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-1 rounded-full text-xs border ${filter === "all" ? "bg-[#0F4C5C] text-white border-[#0F4C5C]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
        >
          All ({deals.length})
        </button>
        {DEAL_STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1 rounded-full text-xs border ${filter === s ? "bg-[#0F4C5C] text-white border-[#0F4C5C]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
          >
            {s} ({counts[s] ?? 0})
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {loading ? (
        <div className="mt-8 text-center text-sm text-gray-400">Loading…</div>
      ) : shown.length === 0 ? (
        <div className="mt-8 text-center text-sm text-gray-500 border border-gray-200 rounded-xl p-8">
          No opportunities {filter === "all" ? "yet" : `in "${filter}"`}. Add them from{" "}
          <a href="/prospecting" className="text-[#0F4C5C] font-semibold">
            Region Prospecting
          </a>{" "}
          or a{" "}
          <a href="/feasibility" className="text-[#0F4C5C] font-semibold">
            Feasibility
          </a>{" "}
          report.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shown.map((d) => (
            <div key={d.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#1a2332]">
                      {d.lot_plan || d.address || "Site"}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${STAGE_COLOR[d.stage] ?? "bg-gray-100 text-gray-700"}`}>
                      {d.stage}
                    </span>
                    <span className="text-[10px] uppercase text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
                      {d.source}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {[
                      d.address && d.lot_plan ? d.address : null,
                      d.zone_code ? `Zone ${d.zone_code}` : null,
                      d.area_sqm ? `${d.area_sqm.toLocaleString()} m²` : null,
                      d.est_lots ? `~${d.est_lots} lots (+${d.extra_lots ?? d.est_lots - 1})` : null,
                      d.lga,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={d.stage}
                    onChange={(e) => patch(d.id, { stage: e.target.value })}
                    className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <a
                    href={feasoHref(d)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#E0F2F1]"
                  >
                    Open feaso
                  </a>
                  {d.center && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${d.center.lat},${d.center.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-gray-500 hover:text-[#0F4C5C]"
                    >
                      Map ↗
                    </a>
                  )}
                  <button
                    onClick={() => remove(d.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <textarea
                defaultValue={d.notes ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (d.notes ?? "")) patch(d.id, { notes: e.target.value });
                }}
                rows={1}
                placeholder="Notes — owner, access, servicing, next step…"
                className="mt-2 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 resize-y focus:outline-none focus:ring-1 focus:ring-[#0F4C5C]"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
