"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatAud } from "../../../utils/partner";
import type { PartnerMapCluster, PartnerMapLot } from "../../../utils/partner-map";
import { PRICE_LEGEND } from "../../properties/map/bands";
import { BASEMAPS, BASEMAP_ORDER, DEFAULT_BASEMAP, type BasemapId } from "../../properties/map/basemaps";
import { BRAND, Card, EmptyState, Icon, brandTint, inputClass } from "../ui";

const MapCanvas = dynamic(() => import("./MapCanvas"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading map…</div>,
});

function range(c: PartnerMapCluster): string {
  if (c.minPrice === null) return "Price on request";
  return c.minPrice === c.maxPrice ? formatAud(c.minPrice) : `${formatAud(c.minPrice)} – ${formatAud(c.maxPrice)}`;
}

function facts(l: PartnerMapLot): string {
  return [
    l.beds != null && `${l.beds} bed`,
    l.baths != null && `${l.baths} bath`,
    l.cars != null && `${l.cars} car`,
    l.landSqm != null && `${Math.round(l.landSqm)} m²`,
  ]
    .filter(Boolean)
    .join(" · ");
}

const STATUS: Record<PartnerMapLot["availability"], { label: string; dot: string }> = {
  available: { label: "Available", dot: "bg-emerald-500" },
  on_hold: { label: "On hold", dot: "bg-amber-500" },
  unavailable: { label: "Unavailable", dot: "bg-slate-400" },
};

export default function PartnerMap({
  clusters,
  unplaced,
  brandColor,
  canResearch,
}: {
  clusters: PartnerMapCluster[];
  unplaced: number;
  brandColor: string;
  canResearch: boolean;
}) {
  const [basemap, setBasemap] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [availableOnly, setAvailableOnly] = useState(true);
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const types = useMemo(() => [...new Set(clusters.flatMap((c) => c.types))].sort(), [clusters]);

  // Filters act on lots, then suburbs with nothing left drop off the map.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return clusters
      .filter((c) => !needle || c.suburb.toLowerCase().includes(needle))
      .map((c) => {
        const lots = c.lots.filter((l) => (!availableOnly || l.availability === "available") && (!type || l.type === type));
        if (lots.length === c.lots.length) return c;
        const prices = lots.map((l) => l.price).filter((p): p is number => p !== null).sort((a, b) => a - b);
        const mid = Math.floor(prices.length / 2);
        return {
          ...c,
          lots,
          count: lots.length,
          available: lots.filter((l) => l.availability === "available").length,
          minPrice: prices.length ? prices[0] : null,
          maxPrice: prices.length ? prices[prices.length - 1] : null,
          medianPrice: prices.length ? (prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2) : null,
        };
      })
      .filter((c) => c.count > 0);
  }, [clusters, availableOnly, type, q]);

  const selected = visible.find((c) => c.key === selectedKey) ?? null;
  const totalLots = visible.reduce((n, c) => n + c.count, 0);

  if (clusters.length === 0) {
    return <EmptyState icon="map" title="No stock to map yet">Suburbs appear here once stock in them has been placed on the map.</EmptyState>;
  }

  return (
    <div className="space-y-4">
      <Card padded={false} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
        <label className="relative block">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a suburb" aria-label="Find a suburb" className={`${inputClass} pl-10`} />
        </label>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Property type" className={inputClass}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} className="peer sr-only" />
          <span className="relative h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-[var(--brand)] after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4" />
          Available only
        </label>
        <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-semibold" role="group" aria-label="Map view">
          {BASEMAP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setBasemap(id)}
              aria-pressed={basemap === id}
              className={`rounded-lg px-2.5 py-1.5 transition ${basemap === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {BASEMAPS[id].label}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card padded={false} className="relative h-[58vh] min-h-[420px] overflow-hidden lg:h-[68vh]">
          <MapCanvas clusters={visible} selectedKey={selected?.key ?? null} onSelect={setSelectedKey} basemap={basemap} brandColor={brandColor} />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[400] rounded-xl bg-white/95 px-3 py-2 text-[11px] shadow-md">
            <div className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Typical price</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {PRICE_LEGEND.map((b) => (
                <span key={b.label} className="flex items-center gap-1.5 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />
                  {b.label}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card padded={false} className="flex max-h-[68vh] min-h-[420px] flex-col overflow-hidden">
          {selected ? (
            <>
              <div className="border-b border-slate-100 p-4">
                <button type="button" onClick={() => setSelectedKey(null)} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
                  <Icon name="arrow-left" className="h-3.5 w-3.5" /> All suburbs
                </button>
                <div className="text-lg font-semibold text-slate-900">
                  {selected.suburb}
                  {selected.state && <span className="font-medium text-slate-500">, {selected.state}</span>}
                </div>
                <div className="text-sm text-slate-600">{range(selected)}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{selected.count} lots</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">{selected.available} available</span>
                </div>
                {canResearch && (
                  <Link
                    href={`/partner/suburbs/report?suburb=${encodeURIComponent(selected.suburb)}&state=${encodeURIComponent(selected.state ?? "")}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
                    style={{ color: BRAND }}
                  >
                    Suburb research report <Icon name="arrow-right" className="h-4 w-4" />
                  </Link>
                )}
              </div>
              <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                {selected.lots.map((l) => (
                  <li key={l.id}>
                    <Link href={`/partner/stock/${l.id}`} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: brandTint(9), color: BRAND }}>
                        <Icon name="home" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900 group-hover:underline">
                          {l.price != null ? formatAud(l.price) : "Price on request"}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{[l.type, facts(l)].filter(Boolean).join(" · ")}</span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className={`h-1.5 w-1.5 rounded-full ${STATUS[l.availability].dot}`} />
                          {STATUS[l.availability].label} · {l.ref}
                        </span>
                      </span>
                      <Icon name="arrow-right" className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <div className="border-b border-slate-100 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {visible.length} suburbs · {totalLots} lots
                </div>
                <div className="text-xs text-slate-500">Pick a suburb on the map or in the list.</div>
              </div>
              {visible.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nothing matches these filters.</p>
              ) : (
                <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
                  {visible.map((c) => (
                    <li key={c.key}>
                      <button type="button" onClick={() => setSelectedKey(c.key)} className="group flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: brandTint(9), color: BRAND }}>
                          <Icon name="pin" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-900">
                            {c.suburb}
                            {c.state && <span className="font-medium text-slate-500">, {c.state}</span>}
                          </span>
                          <span className="block truncate text-xs text-slate-500">{range(c)}</span>
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{c.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
      {unplaced > 0 && (
        <p className="text-xs text-slate-500">
          {unplaced} {unplaced === 1 ? "lot is" : "lots are"} not on the map yet because their suburb hasn&apos;t been placed. They&apos;re all in{" "}
          <Link href="/partner/stock" className="font-semibold underline">Stock</Link>.
        </p>
      )}
    </div>
  );
}
