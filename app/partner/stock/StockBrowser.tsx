"use client";

/**
 * The shared stock book, masked. Filters live in the URL-free local state and
 * are sent to /api/partner/stock, which does the filtering server-side — the
 * browser never holds more than one page of lots.
 *
 * Lots have no photos (masking: renders and brochures carry builder branding),
 * so each card gets an illustrated LotCover in the firm's colours instead.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatAud, type PartnerLot } from "../../../utils/partner";
import { Card, EmptyState, Icon, LotCover, PageHeader, accentTint, buttonSecondary, inputClass } from "../ui";

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

export function AvailabilityBadge({ availability, onDark = false }: { availability: PartnerLot["availability"]; onDark?: boolean }) {
  const label = availability === "available" ? "Available" : availability === "on_hold" ? "On hold" : "No longer available";
  const dot = availability === "available" ? "bg-emerald-500" : availability === "on_hold" ? "bg-amber-500" : "bg-slate-400";
  const style = onDark
    ? "bg-white/95 text-slate-800 shadow-sm"
    : availability === "available"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : availability === "on_hold"
        ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
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

/** Beds / baths / car / study / land / home as icon chips. */
export function LotFactRow({ lot, large = false }: { lot: PartnerLot; large?: boolean }) {
  const facts: { icon: "bed" | "bath" | "car" | "land" | "home" | "study"; text: string; title: string }[] = [];
  if (lot.bedrooms) facts.push({ icon: "bed", text: String(lot.bedrooms), title: "Bedrooms" });
  if (lot.bathrooms) facts.push({ icon: "bath", text: String(lot.bathrooms), title: "Bathrooms" });
  if (lot.carSpaces) facts.push({ icon: "car", text: String(lot.carSpaces), title: "Car spaces" });
  if (lot.study) facts.push({ icon: "study", text: "Study", title: "Study" });
  if (lot.landSizeSqm) facts.push({ icon: "land", text: `${Math.round(lot.landSizeSqm)} m²`, title: "Land" });
  if (lot.houseSizeSqm) facts.push({ icon: "home", text: `${Math.round(lot.houseSizeSqm)} m²`, title: "Home" });
  if (!facts.length) return <div className="text-sm text-slate-500">Details on request</div>;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-2 ${large ? "text-base" : "text-sm"} text-slate-700`}>
      {facts.map((f) => (
        <span key={f.title} className="inline-flex items-center gap-1.5" title={f.title}>
          <Icon name={f.icon} className={`${large ? "h-5 w-5" : "h-4 w-4"} text-slate-400`} />
          <span className="font-medium">{f.text}</span>
        </span>
      ))}
    </div>
  );
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

      <div className={`grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
        {data?.lots.map((lot) => (
          <Link
            key={lot.id}
            href={`/partner/stock/${lot.id}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-12px_rgba(15,23,42,0.3)]"
          >
            <LotCover propertyType={lot.propertyType} seed={lot.ref} className="h-28">
              <div className="flex h-full flex-col justify-between p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium text-white/90 backdrop-blur-sm">
                    {lot.propertyType ?? "New build"}
                  </span>
                  <AvailabilityBadge availability={lot.availability} onDark />
                </div>
                <div className="flex items-center gap-1.5 text-white">
                  <Icon name="pin" className="h-4 w-4 opacity-80" />
                  <span className="text-lg font-semibold leading-tight drop-shadow-sm">
                    {[lot.suburb, lot.state].filter(Boolean).join(", ") || "Location on request"}
                  </span>
                </div>
              </div>
            </LotCover>
            <div className="flex flex-1 flex-col p-4">
              <LotFactRow lot={lot} />
              <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-100 pt-3.5">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{lot.ref}</div>
                  <div className="text-xl font-bold tracking-tight text-slate-900">{lot.price ? formatAud(lot.price) : "Price on request"}</div>
                </div>
                {showFees && (
                  <div className="rounded-xl px-2.5 py-1.5 text-right" style={{ background: accentTint(14) }}>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your fee</div>
                    <div className="text-sm font-bold" style={{ color: `color-mix(in srgb, ${accent} 72%, black)` }}>
                      {lot.referralFee ? formatAud(lot.referralFee) : "Ask us"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

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
