"use client";

import { useMemo, useState } from "react";

/**
 * Operator inputs + report generation for a deal packet.
 *
 * Rent (per-room for co-living, weekly for a single let) and price are editable
 * per property — to supply a missing rent OR to change an already-set value. On
 * "generate" we apply the values (/api/deal-analyser/rent) then regenerate
 * (/api/deal-analyser/generate, which replaces the prior report set), and reload
 * so the figures + report links reflect the new set. Operator estimates only —
 * never a fabricated/builder-quoted figure.
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
interface ReportLink {
  id: string;
  kind: string;
  label: string;
}

const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export default function DealPacketClient({
  packetId,
  properties,
  existingReports,
}: {
  packetId: string;
  status: string;
  properties: Prop[];
  existingReports: ReportLink[];
}) {
  // Editable values, pre-filled from current packet data.
  const init = (p: Prop) => ({
    rent: (p.per_room ? p.room_rent : p.weekly_rent)?.toString() ?? "",
    price: p.price?.toString() ?? "",
  });
  const [vals, setVals] = useState<Record<number, { rent: string; price: string }>>(
    Object.fromEntries(properties.map((p) => [p.index, init(p)])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const num = (s: string): number | null => {
    const v = Number(s);
    return isFinite(v) && v > 0 ? v : null;
  };
  const grossFor = (p: Prop): number | null => {
    const r = num(vals[p.index]?.rent ?? "");
    if (r == null) return null;
    return p.per_room ? Math.round(r * (p.rooms ?? 0)) : Math.round(r);
  };

  // Generate needs a rent on every property (missing rent → that property is skipped).
  const ready = useMemo(() => properties.every((p) => num(vals[p.index]?.rent ?? "") != null), [properties, vals]);
  const anyMissing = properties.some((p) => p.weekly_rent == null);

  async function generate() {
    setError(null);
    setBusy(true);
    try {
      const rents = properties
        .map((p) => {
          const r = num(vals[p.index]?.rent ?? "");
          const price = num(vals[p.index]?.price ?? "");
          if (r == null) return null; // can't generate this one yet
          return {
            index: p.index,
            ...(p.per_room ? { per_room_rent: r } : { weekly_rent: r }),
            ...(price != null ? { price } : {}),
          };
        })
        .filter(Boolean);
      if (rents.length > 0) {
        const rr = await fetch("/api/deal-analyser/rent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_packet_id: packetId, rents }),
        });
        const rj = await rr.json();
        if (!rr.ok) throw new Error(rj.error || "Failed to save values");
      }
      const gr = await fetch("/api/deal-analyser/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId }),
      });
      const gj = await gr.json();
      if (!gr.ok) throw new Error(gj.error || "Failed to generate reports");
      // Reload so editable fields + report links reflect the regenerated set.
      window.location.reload();
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {properties.map((p) => {
        const gross = grossFor(p);
        const v = vals[p.index] ?? { rent: "", price: "" };
        const set = (patch: Partial<{ rent: string; price: string }>) =>
          setVals((s) => ({ ...s, [p.index]: { ...s[p.index], ...patch } }));
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
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">
                <span className="block text-gray-600 mb-1">{p.per_room ? "Rent per room ($/wk)" : "Weekly rent ($/wk)"}</span>
                <input
                  type="number" min={1} inputMode="numeric"
                  value={v.rent}
                  onChange={(e) => set({ rent: e.target.value })}
                  placeholder={p.per_room ? "e.g. 300" : "e.g. 620"}
                  className="w-36 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                />
              </label>
              <label className="text-sm">
                <span className="block text-gray-600 mb-1">Package price ($)</span>
                <input
                  type="number" min={1} inputMode="numeric"
                  value={v.price}
                  onChange={(e) => set({ price: e.target.value })}
                  placeholder="e.g. 734300"
                  className="w-40 rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                />
              </label>
              {p.per_room && gross != null && (
                <p className="text-sm text-gray-600 pb-2">
                  × {p.rooms} rooms = <span className="font-semibold text-gray-900">{AUD(gross)}/wk</span> gross
                </p>
              )}
            </div>
            {p.per_room && (
              <p className="mt-2 text-xs text-gray-400">Operator estimate, attributed to NextKey — not a builder-quoted rent.</p>
            )}
          </div>
        );
      })}

      {existingReports.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Current reports</h2>
          <div className="space-y-2">
            {existingReports.map((r) => (
              <a
                key={r.id}
                href={`/deal-analyser/${r.kind === "comparison" ? "compare" : "report"}/${r.id}`}
                className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-gray-200 hover:border-[#0F4C5C] transition"
              >
                <span className="font-medium text-gray-900 text-sm">{r.label}</span>
                <span className="text-sm font-semibold" style={{ color: "#0F4C5C" }}>View →</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={generate}
        disabled={busy || !ready}
        className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
        style={{ background: "#0F4C5C" }}
      >
        {busy ? "Regenerating…" : existingReports.length > 0 ? "Save changes & regenerate" : anyMissing ? "Save rent & generate reports" : "Generate reports"}
      </button>
      {!ready && <span className="ml-3 text-xs text-gray-400">Enter a rent for each property to continue.</span>}
    </div>
  );
}
