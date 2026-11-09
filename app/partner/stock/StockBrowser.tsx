"use client";

/**
 * The shared stock book, masked. Filters live in the URL-free local state and
 * are sent to /api/partner/stock, which does the filtering server-side — the
 * browser never holds more than one page of lots.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatAud, type PartnerLot } from "../../../utils/partner";

type Response = {
  ok: boolean;
  error?: string;
  total: number;
  page: number;
  pageSize: number;
  lots: PartnerLot[];
  facets: { states: string[]; types: string[] };
  asAt: string;
};

const SORTS = [
  { value: "newest", label: "Recently updated" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "fee_desc", label: "Referral fee: highest" },
];

export function AvailabilityBadge({ availability }: { availability: PartnerLot["availability"] }) {
  const style =
    availability === "available"
      ? "bg-green-50 text-green-800 border-green-200"
      : availability === "on_hold"
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-gray-100 text-gray-600 border-gray-200";
  const label = availability === "available" ? "Available" : availability === "on_hold" ? "On hold" : "No longer available";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}>{label}</span>;
}

export function lotFacts(lot: PartnerLot): string {
  return [
    lot.bedrooms && `${lot.bedrooms} bed`,
    lot.bathrooms && `${lot.bathrooms} bath`,
    lot.carSpaces && `${lot.carSpaces} car`,
    lot.study && "study",
    lot.landSizeSqm && `${Math.round(lot.landSizeSqm)} m² land`,
    lot.houseSizeSqm && `${Math.round(lot.houseSizeSqm)} m² home`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function StockBrowser({ showFees, accent }: { showFees: boolean; accent: string }) {
  const [filters, setFilters] = useState({
    state: "",
    q: "",
    minBeds: "",
    maxPrice: "",
    type: "",
    available: false,
    sort: "newest",
  });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), sort: filters.sort });
    if (filters.state) params.set("state", filters.state);
    if (filters.q) params.set("q", filters.q);
    if (filters.minBeds) params.set("minBeds", filters.minBeds);
    if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
    if (filters.type) params.set("type", filters.type);
    if (filters.available) params.set("available", "1");
    try {
      const res = await fetch(`/api/partner/stock?${params}`);
      if (res.status === 401) {
        window.location.href = "/partner";
        return;
      }
      const json = (await res.json()) as Response;
      if (!res.ok || !json.ok) setError(json.error ?? "Couldn't load stock.");
      else setData(json);
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const t = setTimeout(load, filters.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, filters.q]);

  const set = (patch: Partial<typeof filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const field = "rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Stock</h1>
          <p className="text-sm text-gray-600">
            {data ? `${data.total.toLocaleString("en-AU")} lots` : "Loading…"}
            {data && ` · as at ${new Date(data.asAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })}`}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-3 lg:grid-cols-7">
        <input className={`${field} col-span-2 sm:col-span-1 lg:col-span-2`} placeholder="Suburb" value={filters.q} onChange={(e) => set({ q: e.target.value })} aria-label="Suburb" />
        <select className={field} value={filters.state} onChange={(e) => set({ state: e.target.value })} aria-label="State">
          <option value="">All states</option>
          {data?.facets.states.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className={field} value={filters.type} onChange={(e) => set({ type: e.target.value })} aria-label="Type">
          <option value="">All types</option>
          {data?.facets.types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className={field} value={filters.minBeds} onChange={(e) => set({ minBeds: e.target.value })} aria-label="Bedrooms">
          <option value="">Any beds</option>
          {[2, 3, 4, 5].map((b) => <option key={b} value={b}>{b}+ beds</option>)}
        </select>
        <select className={field} value={filters.maxPrice} onChange={(e) => set({ maxPrice: e.target.value })} aria-label="Maximum price">
          <option value="">Any price</option>
          {[500_000, 600_000, 700_000, 800_000, 900_000, 1_000_000, 1_250_000, 1_500_000].map((p) => (
            <option key={p} value={p}>Up to {formatAud(p)}</option>
          ))}
        </select>
        <select className={field} value={filters.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
          {SORTS.filter((s) => showFees || s.value !== "fee_desc").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <label className="col-span-2 flex items-center gap-2 text-sm text-gray-700 sm:col-span-3 lg:col-span-7">
          <input type="checkbox" checked={filters.available} onChange={(e) => set({ available: e.target.checked })} />
          Available only (hide lots already on hold)
        </label>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        {data?.lots.map((lot) => (
          <Link
            key={lot.id}
            href={`/partner/stock/${lot.id}`}
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-4 transition hover:border-gray-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-gray-900">{[lot.suburb, lot.state].filter(Boolean).join(", ") || "Location on request"}</div>
                <div className="text-xs text-gray-500">{lot.ref}{lot.propertyType ? ` · ${lot.propertyType}` : ""}</div>
              </div>
              <AvailabilityBadge availability={lot.availability} />
            </div>
            <div className="mt-2 text-sm text-gray-700">{lotFacts(lot) || "Details on request"}</div>
            <div className="mt-auto flex items-end justify-between pt-3">
              <div className="text-lg font-semibold text-gray-900">{lot.price ? formatAud(lot.price) : "Price on request"}</div>
              {showFees && (
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wide text-gray-500">Your fee</div>
                  <div className="text-sm font-semibold" style={{ color: accent }}>
                    {lot.referralFee ? formatAud(lot.referralFee) : "Ask us"}
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {data && data.total === 0 && !loading && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No lots match those filters.
        </div>
      )}

      {pages > 1 && (
        <div className="mt-5 flex items-center justify-center gap-2 text-sm">
          <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="text-gray-600">Page {page} of {pages}</span>
          <button className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 disabled:opacity-40" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
