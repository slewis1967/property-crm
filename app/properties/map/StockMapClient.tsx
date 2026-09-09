"use client";

/**
 * Stock Map — where the stock in the aggregator feed actually is.
 *
 * The unit is the SUBURB, not the property: global_stock_pool carries no
 * coordinates and only ~4% of rows have a street address, so a pin per
 * property would show almost nothing. One bubble per suburb, sized by count,
 * coloured by median package price; click a bubble to see what's there.
 *
 * Filters mirror the Aggregator Feed's, and every filter is pushed to the
 * server (/api/properties/map) so the map describes the whole pool, not just
 * the page of stock the feed happens to have loaded.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { SuburbCluster, UnlocatedSuburb } from "../../../utils/geo/clusters";
import { PRICE_LEGEND } from "./bands";

const StockMapCanvas = dynamic(() => import("./StockMapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center text-sm text-gray-400">
      Loading map…
    </div>
  ),
});

const TEAL = "#0F4C5C";
const STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

type MapResponse = {
  ok: boolean;
  clusters: SuburbCluster[];
  unlocated: UnlocatedSuburb[];
  total: number;
  located: number;
  needsGeocode: string[];
  tableMissing: boolean;
  error?: string;
};

type Filters = {
  state: string;
  builder: string;
  type: string;
  bedsMin: string;
  priceMin: string;
  priceMax: string;
  q: string;
};

const EMPTY_FILTERS: Filters = {
  state: "",
  builder: "",
  type: "",
  bedsMin: "",
  priceMin: "",
  priceMax: "",
  q: "",
};

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

/** Compact price for dense list rows: $712k / $1.24m. */
function moneyShort(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`;
  return `$${Math.round(n / 1000)}k`;
}

export default function StockMapClient({
  allBuilders,
  allTypes,
}: {
  allBuilders: string[];
  allTypes: string[];
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [data, setData] = useState<MapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeNote, setGeocodeNote] = useState("");

  // Guards against a slow early request landing after a faster later one and
  // repainting the map with stale filters.
  const reqSeq = useRef(0);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    if (filters.state) sp.set("state", filters.state);
    if (filters.builder) sp.set("builder", filters.builder);
    if (filters.type) sp.set("type", filters.type);
    if (filters.bedsMin) sp.set("bedsMin", filters.bedsMin);
    if (filters.priceMin) sp.set("priceMin", filters.priceMin);
    if (filters.priceMax) sp.set("priceMax", filters.priceMax);
    if (filters.q) sp.set("q", filters.q);
    return sp.toString();
  }, [filters]);

  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/properties/map${query ? `?${query}` : ""}`);
      const json = (await res.json()) as MapResponse;
      if (seq !== reqSeq.current) return; // superseded
      if (!res.ok || !json.ok) {
        setError(json.error || `Request failed (${res.status})`);
        setData(null);
      } else {
        setData(json);
      }
    } catch (e) {
      if (seq !== reqSeq.current) return;
      setError(e instanceof Error ? e.message : "Could not load the map");
      setData(null);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [query]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  /**
   * Fill the geocode cache for suburbs we've never looked up.
   *
   * Loops in small server-side batches because Nominatim allows 1 request per
   * second and Netlify functions time out around 26s. Each suburb is resolved
   * once, ever — after the first full pass this button stops appearing.
   */
  const runGeocode = useCallback(async () => {
    if (!data?.needsGeocode?.length) return;
    setGeocoding(true);
    setGeocodeNote("");
    let remaining = [...data.needsGeocode];
    let resolved = 0;
    let failed = 0;

    try {
      while (remaining.length > 0) {
        const res = await fetch("/api/properties/map/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: remaining }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setGeocodeNote(json.error || `Geocoding stopped (${res.status})`);
          break;
        }
        resolved += json.resolved?.length ?? 0;
        failed += json.failed?.length ?? 0;
        remaining = json.remaining ?? [];
        setGeocodeNote(
          `Located ${resolved}${failed ? `, ${failed} not found` : ""}… ${remaining.length} to go`,
        );
      }
      setGeocodeNote(
        `Located ${resolved} suburb${resolved === 1 ? "" : "s"}` +
          (failed ? ` · ${failed} couldn't be matched` : ""),
      );
      await load();
    } catch (e) {
      setGeocodeNote(e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }, [data, load]);

  // Derived, not synced: if a filter change removes the selected suburb from
  // the result set, `selected` simply falls back to null and the panel returns
  // to the list. The key is kept in state, so clearing the filter re-opens the
  // suburb the operator was looking at.
  const selected = data?.clusters.find((c) => c.key === selectedKey) ?? null;
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const unplaced = data?.unlocated.reduce((n, u) => n + u.count, 0) ?? 0;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-start gap-3 mb-5">
        <div>
          <h1 className="text-3xl font-bold">Stock Map</h1>
          <p className="text-gray-500 text-sm mt-1">
            Where the stock in the aggregator feed is located — one bubble per suburb,
            sized by how many properties we hold there.
          </p>
        </div>
        <Link
          href="/properties"
          className="text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 whitespace-nowrap"
        >
          ← Aggregator Feed
        </Link>
      </div>

      {/* Filters — same contract as the feed, all applied server-side. */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search suburb, builder, estate…"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select
          value={filters.state}
          onChange={(e) => set({ state: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filters.builder}
          onChange={(e) => set({ builder: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm max-w-[220px]"
        >
          <option value="">All builders</option>
          {allBuilders.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <select
          value={filters.type}
          onChange={(e) => set({ type: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {allTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filters.bedsMin}
          onChange={(e) => set({ bedsMin: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Any beds</option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={String(n)}>
              {n}+ beds
            </option>
          ))}
        </select>
        <input
          value={filters.priceMin}
          onChange={(e) => set({ priceMin: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="Min $"
          inputMode="numeric"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
        />
        <input
          value={filters.priceMax}
          onChange={(e) => set({ priceMax: e.target.value.replace(/[^0-9]/g, "") })}
          placeholder="Max $"
          inputMode="numeric"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24"
        />
        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-sm px-3 py-2 rounded-lg text-gray-600 hover:bg-gray-100"
          >
            Clear
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 mb-4 text-sm">
          {error}
        </div>
      )}

      {data?.tableMissing && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl p-4 mb-4 text-sm">
          <strong>Geocode cache not migrated.</strong> Run{" "}
          <code className="bg-yellow-100 px-1 rounded">
            migrations/20260909_stock_geocodes.sql
          </code>{" "}
          in the Supabase SQL editor, then reload — suburbs can&apos;t be placed on the map
          until that table exists.
        </div>
      )}

      {/* Coverage strip — the map must never quietly hide stock it couldn't place. */}
      {data && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
          <span className="px-3 py-1.5 rounded-full bg-gray-100 font-medium">
            {data.located.toLocaleString("en-AU")} of {data.total.toLocaleString("en-AU")}{" "}
            properties mapped
          </span>
          <span className="px-3 py-1.5 rounded-full bg-gray-100">
            {data.clusters.length} suburb{data.clusters.length === 1 ? "" : "s"}
          </span>
          {unplaced > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
              {unplaced.toLocaleString("en-AU")} not placed
            </span>
          )}
          {!data.tableMissing && data.needsGeocode.length > 0 && (
            <button
              onClick={runGeocode}
              disabled={geocoding}
              className="px-3 py-1.5 rounded-full text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: TEAL }}
            >
              {geocoding
                ? "Locating…"
                : `Locate ${data.needsGeocode.length} suburb${data.needsGeocode.length === 1 ? "" : "s"}`}
            </button>
          )}
          {geocodeNote && <span className="text-gray-500">{geocodeNote}</span>}
          {loading && <span className="text-gray-400">Loading…</span>}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Map */}
        <div className="lg:col-span-2">
          <div className="h-[560px] bg-white border border-gray-200 rounded-xl overflow-hidden">
            {data && data.clusters.length === 0 && !loading ? (
              <div className="h-full grid place-items-center text-center px-6">
                <div>
                  <p className="text-gray-500 font-medium">Nothing to map.</p>
                  <p className="text-gray-400 text-sm mt-1">
                    {data.total === 0
                      ? "No stock matches these filters."
                      : "Stock matched, but none of its suburbs have been located yet — use “Locate suburbs” above."}
                  </p>
                </div>
              </div>
            ) : (
              <StockMapCanvas
                clusters={data?.clusters ?? []}
                selectedKey={selected?.key ?? null}
                onSelect={setSelectedKey}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 items-center">
            <span className="font-medium text-gray-600">Median package price:</span>
            {PRICE_LEGEND.map((b) => (
              <span key={b.label} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </span>
            ))}
            <span className="ml-auto">Bubble area ∝ number of properties</span>
          </div>
        </div>

        {/* Drill-down / suburb list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col h-[560px]">
          {selected ? (
            <>
              <div className="p-4 border-b border-gray-200">
                <button
                  onClick={() => setSelectedKey(null)}
                  className="text-xs text-gray-500 hover:text-gray-800 mb-2"
                >
                  ← All suburbs
                </button>
                <h2 className="font-bold text-lg leading-tight">
                  {selected.suburb}
                  {selected.state ? `, ${selected.state}` : ""}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selected.count} propert{selected.count === 1 ? "y" : "ies"} ·{" "}
                  {money(selected.minPrice)} – {money(selected.maxPrice)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Median {money(selected.medianPrice)} ·{" "}
                  {selected.builders.length} builder
                  {selected.builders.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {selected.items.map((it) => (
                  <Link
                    key={it.id}
                    href={`/properties/${it.id}`}
                    className="block p-3 hover:bg-gray-50"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {it.address || it.estate || it.builder || "Property"}
                        {it.lot ? ` · Lot ${it.lot}` : ""}
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {moneyShort(it.price)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {[
                        it.builder,
                        it.type,
                        it.beds ? `${it.beds} bed` : null,
                        it.landSize ? `${it.landSize}m²` : null,
                        it.titled ? "Titled" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="p-4 border-b border-gray-200">
                <h2 className="font-bold">Suburbs by volume</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Click a row or a bubble to see the stock.
                </p>
              </div>
              <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
                {(data?.clusters ?? []).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setSelectedKey(c.key)}
                    className="w-full text-left p-3 hover:bg-gray-50"
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {c.suburb}
                        {c.state ? `, ${c.state}` : ""}
                      </span>
                      <span className="text-sm font-semibold whitespace-nowrap">{c.count}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      median {moneyShort(c.medianPrice)} · {c.builders.length} builder
                      {c.builders.length === 1 ? "" : "s"}
                    </div>
                  </button>
                ))}

                {/* Stock we couldn't place, stated plainly rather than dropped. */}
                {(data?.unlocated ?? []).length > 0 && (
                  <div className="p-3 bg-amber-50">
                    <p className="text-xs font-semibold text-amber-800 mb-1">
                      Not on the map ({unplaced.toLocaleString("en-AU")})
                    </p>
                    <ul className="text-xs text-amber-700 space-y-0.5">
                      {(data?.unlocated ?? []).slice(0, 25).map((u, i) => (
                        <li key={u.key ?? `no-suburb-${i}`}>
                          {u.suburb}
                          {u.state ? `, ${u.state}` : ""} — {u.count}
                          {u.reason === "geocode-failed" && " (suburb not found)"}
                          {u.reason === "no-suburb" && " (no suburb recorded)"}
                        </li>
                      ))}
                      {(data?.unlocated ?? []).length > 25 && (
                        <li className="italic">
                          …and {(data?.unlocated.length ?? 0) - 25} more
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
