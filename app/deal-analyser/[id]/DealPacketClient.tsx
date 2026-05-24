"use client";

import { useMemo, useState } from "react";

/**
 * Operator rent-input + report-generation form.
 *
 * For any property missing a rent, the operator enters the figure (per-room for
 * co-living, weekly for a single let). On "Generate reports" we POST the rents
 * (/api/deal-analyser/rent) then generate (/api/deal-analyser/generate), and link
 * straight to the resulting PIA reports + comparison. Nothing is pre-filled — the
 * figure is the operator's NextKey estimate, never a fabricated number.
 */

interface Prop {
  index: number;
  suburb: string | null;
  address: string | null;
  is_co_living: boolean;
  per_room: boolean;
  rooms: number | null;
  weekly_rent: number | null;
  room_rent: number | null;
  source: string | null;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  land: number | null;
}

const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

type GenResult = {
  generated: { suburb: string | null; report_id: string }[];
  comparison_report_id: string | null;
  needs_rent_input: string[];
};

export default function DealPacketClient({
  packetId,
  status,
  properties,
}: {
  packetId: string;
  status: string;
  properties: Prop[];
}) {
  const needRent = properties.filter((p) => p.weekly_rent == null);
  // input state keyed by property index (string for controlled inputs)
  const [rents, setRents] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);

  const grossFor = (p: Prop, raw: string): number | null => {
    const v = Number(raw);
    if (!isFinite(v) || v <= 0) return null;
    return p.per_room ? Math.round(v * (p.rooms ?? 0)) : Math.round(v);
  };

  const ready = useMemo(
    () => needRent.every((p) => grossFor(p, rents[p.index] ?? "") != null),
    [needRent, rents],
  );

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      if (needRent.length > 0) {
        const payload = needRent.map((p) => ({
          index: p.index,
          ...(p.per_room ? { per_room_rent: Number(rents[p.index]) } : { weekly_rent: Number(rents[p.index]) }),
        }));
        const rr = await fetch("/api/deal-analyser/rent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_packet_id: packetId, rents: payload }),
        });
        const rj = await rr.json();
        if (!rr.ok) throw new Error(rj.error || "Failed to save rent");
      }
      const gr = await fetch("/api/deal-analyser/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId }),
      });
      const gj = await gr.json();
      if (!gr.ok) throw new Error(gj.error || "Failed to generate reports");
      setResult({
        generated: gj.generated ?? [],
        comparison_report_id: gj.comparison_report_id ?? null,
        needs_rent_input: gj.needs_rent_input ?? [],
      });
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Reports generated</h2>
        <p className="text-sm text-gray-500 mb-5">Review, then deliver to the client.</p>
        <div className="space-y-2">
          {result.generated.map((g) => (
            <a
              key={g.report_id}
              href={`/deal-analyser/report/${g.report_id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-[#0F4C5C] transition"
            >
              <span className="font-medium text-gray-900">PIA — {g.suburb ?? "Property"}</span>
              <span className="text-sm font-semibold" style={{ color: "#0F4C5C" }}>View →</span>
            </a>
          ))}
          {result.comparison_report_id && (
            <a
              href={`/deal-analyser/compare/${result.comparison_report_id}`}
              className="flex items-center justify-between px-4 py-3 rounded-lg border-2 transition hover:opacity-90"
              style={{ borderColor: "#FFB627", background: "#FFB6270a" }}
            >
              <span className="font-medium text-gray-900">Comparison — {result.generated.length} properties (rating + best pick)</span>
              <span className="text-sm font-semibold" style={{ color: "#B07A00" }}>View →</span>
            </a>
          )}
        </div>
        {result.needs_rent_input.length > 0 && (
          <p className="text-xs text-amber-700 mt-4">
            Still missing rent (not reported): {result.needs_rent_input.join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {properties.map((p) => {
        const needs = p.weekly_rent == null;
        const raw = rents[p.index] ?? "";
        const gross = needs ? grossFor(p, raw) : p.weekly_rent;
        return (
          <div key={p.index} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-gray-900">{p.address ?? p.suburb ?? "Property"}</h3>
                <p className="text-sm text-gray-500">
                  {p.suburb && p.address ? `${p.suburb} · ` : ""}
                  {p.is_co_living ? `Co-living · ${p.rooms ?? "?"} rooms` : "Single tenancy"}
                  {p.bathrooms != null ? ` · ${p.bathrooms} bath` : ""}
                  {p.land != null ? ` · ${p.land} m²` : ""}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">{AUD(p.price)}</span>
            </div>

            {needs ? (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-gray-600 mb-1">
                    {p.per_room ? "Rent per room ($/wk)" : "Weekly rent ($/wk)"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={raw}
                    onChange={(e) => setRents((r) => ({ ...r, [p.index]: e.target.value }))}
                    placeholder={p.per_room ? "e.g. 300" : "e.g. 620"}
                    className="w-40 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                  />
                </label>
                {p.per_room && gross != null && (
                  <p className="text-sm text-gray-600 pb-2">
                    × {p.rooms} rooms = <span className="font-semibold text-gray-900">{AUD(gross)}/wk</span> gross
                  </p>
                )}
                {p.per_room && (
                  <p className="basis-full text-xs text-gray-400">
                    Operator estimate, attributed to NextKey — not a builder-quoted rent.
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-700">
                Rent: <span className="font-semibold">{AUD(p.weekly_rent)}/wk</span>
                {p.per_room && p.room_rent ? ` (${AUD(p.room_rent)}/room × ${p.rooms})` : ""}
                {p.source ? <span className="text-gray-400"> · {p.source === "operator" ? "operator estimate" : "from email"}</span> : null}
              </p>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={generate}
        disabled={busy || !ready}
        className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
        style={{ background: "#0F4C5C" }}
      >
        {busy ? "Generating…" : needRent.length > 0 ? "Save rent & generate reports" : "Generate reports"}
      </button>
      {!ready && needRent.length > 0 && (
        <span className="ml-3 text-xs text-gray-400">Enter a rent for each property to continue.</span>
      )}
    </div>
  );
}
