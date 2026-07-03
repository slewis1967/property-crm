"use client";

/**
 * Region Prospecting — enter a region (NSW), comb it for parcels with real
 * subdivision headroom (area ≥ 2 × minimum lot size in a residential zone),
 * review a ranked shortlist, and hand any candidate to the Planning Feasibility
 * tool to prepare the full Archistar-style assessment.
 */

import { useState } from "react";
import type { Candidate, ScanResult } from "../../utils/prospecting/types";

const TEAL = "#0F4C5C";

const AREA_PRESETS = [
  { label: "≥ 700 m²", value: 700 },
  { label: "≥ 800 m²", value: 800 },
  { label: "≥ 1,000 m²", value: 1000 },
  { label: "≥ 2,000 m²", value: 2000 },
];

export default function ProspectingClient() {
  const [region, setRegion] = useState("");
  const [minArea, setMinArea] = useState(800);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const candKey = (c: Candidate) => c.lotPlan ?? `${c.center.lat},${c.center.lng}`;

  async function saveToWatchlist(c: Candidate) {
    const id = candKey(c);
    if (savedIds.has(id) || savingId === id) return;
    setSavingId(id);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "prospecting",
          lotPlan: c.lotPlan,
          lga: c.lga,
          state: "NSW",
          zoneCode: c.zoneCode,
          areaSqm: c.areaSqm,
          minLotSqm: c.minLotSqm,
          estLots: c.estLots,
          extraLots: c.extraLots,
          center: c.center,
          data: c,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      setSavedIds((s) => new Set(s).add(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save to watchlist");
    } finally {
      setSavingId(null);
    }
  }

  async function scan() {
    if (!region.trim() || loading) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/prospecting/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ region, minAreaSqm: minArea, maxCandidates: 40 }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || `Scan failed (${res.status})`);
      setResult(json.result as ScanResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  async function prepareFeaso(cand: Candidate) {
    const id = cand.lotPlan ?? `${cand.center.lat},${cand.center.lng}`;
    setResolvingId(id);
    try {
      const res = await fetch("/api/prospecting/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: cand.center.lat, lng: cand.center.lng }),
      });
      const json = await res.json();
      const address = (json?.address as string) || "";
      const q = address || `${cand.lotPlan ?? ""} ${cand.lga ?? ""} NSW`.trim();
      window.location.href = `/feasibility?address=${encodeURIComponent(q)}&auto=1`;
    } catch {
      // Fall back to lot/plan-based address.
      const q = `${cand.lotPlan ?? ""} ${cand.lga ?? ""} NSW`.trim();
      window.location.href = `/feasibility?address=${encodeURIComponent(q)}&auto=1`;
    }
  }

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-6">
      <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
        Region Prospecting
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        Comb a region for parcels with subdivision headroom, then send any one straight to a full
        feasibility assessment. Uses NSW government cadastre + minimum-lot-size + zoning data.
      </p>

      {/* Search bar */}
      <div className="mt-5 flex flex-wrap gap-3 items-end bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Region</label>
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && scan()}
            placeholder="e.g. Cessnock NSW, Maitland NSW, Kellyville NSW"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-gray-500 mb-1">Min lot area</label>
          <select
            value={minArea}
            onChange={(e) => setMinArea(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            {AREA_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={scan}
          disabled={loading || !region.trim()}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ background: TEAL }}
        >
          {loading ? "Scanning…" : "Scan region"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Pulling cadastre, minimum-lot-size and zoning for the region and testing each parcel… this
          can take 10–30 seconds.
        </div>
      )}

      {result && (
        <div className="mt-6">
          {/* Notes / status */}
          {!result.supported && (
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {result.notes.join(" ")}
            </div>
          )}

          {result.supported && (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                <span className="text-sm font-semibold text-[#1a2332]">
                  {result.candidates.length} candidate{result.candidates.length === 1 ? "" : "s"} found
                </span>
                <span className="text-xs text-gray-500">
                  scanned {result.scanned} large parcels in {result.region}
                </span>
              </div>
              {result.notes.map((n, i) => (
                <div key={i} className="text-[12px] text-amber-700 mb-1">
                  {n}
                </div>
              ))}

              {result.candidates.length === 0 ? (
                <div className="mt-4 text-sm text-gray-500 border border-gray-200 rounded-lg p-6 text-center">
                  No parcels with clear subdivision headroom at ≥ {minArea.toLocaleString()} m². Try a
                  lower minimum area or a different suburb/town.
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl mt-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2">Lot / Plan</th>
                        <th className="px-3 py-2">Area</th>
                        <th className="px-3 py-2">Zone</th>
                        <th className="px-3 py-2">Min lot</th>
                        <th className="px-3 py-2">Est. lots</th>
                        <th className="px-3 py-2">Net new</th>
                        <th className="px-3 py-2">Council</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.candidates.map((c) => {
                        const id = c.lotPlan ?? `${c.center.lat},${c.center.lng}`;
                        return (
                          <tr key={id} className="border-t border-gray-100 hover:bg-gray-50/60">
                            <td className="px-3 py-2 font-medium whitespace-nowrap">
                              {c.lotPlan || `${c.lot ?? ""}/${c.plan ?? ""}`}
                              {c.note && (
                                <span
                                  title={c.note}
                                  className="ml-1.5 text-[10px] font-bold uppercase text-amber-700"
                                >
                                  ⚑
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{c.areaSqm.toLocaleString()} m²</td>
                            <td className="px-3 py-2 whitespace-nowrap">{c.zoneCode ?? "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">{c.minLotSqm.toLocaleString()} m²</td>
                            <td className="px-3 py-2 font-semibold" style={{ color: TEAL }}>
                              ~{c.estLots}
                            </td>
                            <td className="px-3 py-2 text-emerald-700 font-semibold">+{c.extraLots}</td>
                            <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{c.lga ?? "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-right">
                              <a
                                href={`https://www.google.com/maps/search/?api=1&query=${c.center.lat},${c.center.lng}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gray-500 hover:text-[#0F4C5C] mr-3 text-xs"
                              >
                                Map ↗
                              </a>
                              <button
                                onClick={() => saveToWatchlist(c)}
                                disabled={savingId === id || savedIds.has(id)}
                                className="text-xs font-semibold px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-60 mr-2"
                                title="Add to Development Watchlist"
                              >
                                {savedIds.has(id) ? "★ Saved" : savingId === id ? "Saving…" : "☆ Save"}
                              </button>
                              <button
                                onClick={() => prepareFeaso(c)}
                                disabled={resolvingId === id}
                                className="text-xs font-semibold px-3 py-1.5 rounded-md border border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#E0F2F1] disabled:opacity-60"
                              >
                                {resolvingId === id ? "Opening…" : "Prepare feaso"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-gray-400 mt-3">
                Estimated lots = site area ÷ minimum lot size — an upper bound before access handles,
                road widening, corner truncations, servicing and overlays. A preliminary screen, not a
                subdivision approval. Confirm each with the DCP/scheme and Council.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
