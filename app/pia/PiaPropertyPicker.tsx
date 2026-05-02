"use client";

import { useEffect, useState } from "react";

export type PiaProperty = {
  id: string;
  builder_name: string | null;
  estate_name: string | null;
  lot_number: string | null;
  street_address: string | null;
  suburb: string | null;
  state: string | null;
  total_package_price: number | null;
  land_price: number | null;
  build_price: number | null;
  house_price: number | null;
  expected_rent_weekly: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_spaces: number | null;
};

export default function PiaPropertyPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (p: PiaProperty) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PiaProperty[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/pia/properties?q=${encodeURIComponent(q)}&limit=80`);
        const json = await res.json();
        if (!cancelled && json.ok) setResults(json.properties);
      } catch {
        // swallow — show empty list
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, q ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative ml-auto h-full w-full max-w-lg bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Pick a property</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
          </div>
          <input
            type="search"
            placeholder="Search suburb, state, street, builder, estate…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            autoFocus
          />
          <p className="text-xs text-gray-500 mt-2">
            Active stock pool only. Legacy + withdrawn rows are filtered out.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="p-4 text-sm text-gray-400">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="p-4 text-sm text-gray-400">
              {q ? `No properties match "${q}".` : "No active properties in the pool yet."}
            </p>
          )}
          <ul className="divide-y divide-gray-100">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => {
                    onSelect(p);
                    onClose();
                  }}
                  className="w-full text-left p-4 hover:bg-blue-50 transition"
                >
                  <p className="font-medium text-sm">
                    {p.street_address || p.estate_name || "(no address)"}
                    {p.lot_number ? ` · Lot ${p.lot_number}` : ""}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[p.suburb, p.state].filter(Boolean).join(", ")}
                    {p.builder_name ? ` · ${p.builder_name}` : ""}
                  </p>
                  <p className="text-xs text-gray-700 mt-1">
                    {p.total_package_price ? `$${p.total_package_price.toLocaleString("en-AU")}` : "$—"}
                    {p.expected_rent_weekly ? ` · $${p.expected_rent_weekly}/wk` : ""}
                    {p.bedrooms ? ` · ${p.bedrooms}b` : ""}
                    {p.bathrooms ? `${p.bathrooms}b` : ""}
                    {p.car_spaces ? ` ${p.car_spaces}c` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
