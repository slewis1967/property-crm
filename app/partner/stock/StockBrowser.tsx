"use client";

/**
 * The shared stock book, masked. Filters live in the URL-free local state and
 * are sent to /api/partner/stock, which does the filtering server-side — the
 * browser never holds more than one page of lots.
 *
 * Lots have no photos (masking: renders and brochures carry builder branding),
 * so each card gets an illustrated LotCover in the firm's colours instead.
 */
import { useCallback, useEffect, useState } from "react";
import { formatAud, type PartnerLot } from "../../../utils/partner";
import { isNewThisWeek } from "../../../utils/partner-insights";
import { Card, EmptyState, Icon, PageHeader, Skeleton, buttonSecondary, inputClass } from "../ui";
import StockCard from "./StockCard";

export type StockInitialFilters = Partial<{ state: string; q: string; minBeds: string; maxPrice: string; type: string; available: boolean; sort: string }>;

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
      <Skeleton className="h-36 rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex justify-between pt-3">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </div>
  );
}

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

export { AvailabilityBadge, LotFactRow } from "./StockCard";

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

export default function StockBrowser({ showFees, initialFilters = {} }: { showFees: boolean; initialFilters?: StockInitialFilters }) {
  const [filters, setFilters] = useState({
    state: "",
    q: "",
    minBeds: "",
    maxPrice: "",
    type: "",
    available: false,
    sort: "newest",
    ...initialFilters,
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
  const now = data ? new Date(data.asAt) : new Date(0);
  const field = `${inputClass} py-2`;
  const asAt = data
    ? new Date(data.asAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Stock book"
        title="Find the right lot for your client"
        icon="grid"
        subtitle={
          data ? (
            <>
              <strong className="text-slate-900">{data.total.toLocaleString("en-AU")}</strong> lots across{" "}
              {data.facets.states.length} states · updated {asAt}
            </>
          ) : (
            "Loading the latest stock…"
          )
        }
      />

      <Card className="mb-6" padded={false}>
        <div className="grid grid-cols-2 gap-2.5 p-3 sm:grid-cols-3 sm:p-4 lg:grid-cols-7">
          <label className="relative col-span-2 sm:col-span-1 lg:col-span-2">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${field} pl-9`} placeholder="Search a suburb" value={filters.q} onChange={(e) => set({ q: e.target.value })} aria-label="Suburb" />
          </label>
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
          <select className={`${field} col-span-2 sm:col-span-1`} value={filters.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort">
            {SORTS.filter((s) => showFees || s.value !== "fee_desc").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" className="peer sr-only" checked={filters.available} onChange={(e) => set({ available: e.target.checked })} />
            <span
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:ring-4 peer-focus-visible:ring-slate-300 ${filters.available ? "bg-[var(--brand)]" : "bg-slate-300"}`}
              aria-hidden="true"
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${filters.available ? "left-[18px]" : "left-0.5"}`} />
            </span>
            Available only
          </label>
          {loading && <span className="text-xs text-slate-400">Updating…</span>}
        </div>
      </Card>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!data && loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : (
        <div key={`${page}-${JSON.stringify(filters)}`} className={`pp-stagger grid grid-cols-1 gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
          {data?.lots.map((lot) => (
            <StockCard key={lot.id} lot={lot} showFees={showFees} isNew={isNewThisWeek(lot, now)} />
          ))}
        </div>
      )}

      {data && data.total === 0 && !loading && (
        <EmptyState icon="search" title="No lots match those filters">Try a wider price range or another state.</EmptyState>
      )}

      {pages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          <button className={buttonSecondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <Icon name="arrow-left" /> Previous
          </button>
          <span className="rounded-full bg-white px-3 py-1 text-slate-600 ring-1 ring-slate-200">
            Page {page} of {pages}
          </span>
          <button className={buttonSecondary} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next <Icon name="arrow-right" />
          </button>
        </div>
      )}
    </div>
  );
}
