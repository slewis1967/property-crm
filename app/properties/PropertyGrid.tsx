"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { jsPDF } from "jspdf";
import { useRouter } from 'next/router';

// Deterministic gradient palette so cards from the same builder share a
// visual identity instead of all looking like the same "No Image" tile.
const TILE_GRADIENTS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-cyan-500 to-sky-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-purple-600",
];
function tileGradient(seed: string | null | undefined): string {
  if (!seed) return TILE_GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TILE_GRADIENTS[Math.abs(hash) % TILE_GRADIENTS.length];
}

// Fallback icon lookup — used when a property's type isn't in the
// settings list (e.g. legacy rows, or freshly-extracted type the user
// hasn't yet added to settings).
function fallbackIcon(t: string | null | undefined): string {
  const k = (t || "").toLowerCase();
  if (k.includes("townhouse")) return "🏘️";
  if (k.includes("apartment") || k.includes("unit")) return "🏢";
  if (k.includes("duplex")) return "🏠";
  if (k.includes("land")) return "🟩";
  if (k.includes("sda")) return "♿";
  if (k.includes("acreage") || k.includes("rural")) return "🌳";
  return "🏡"; // house & land / house default
}

type SettingsPropertyType = { name: string; icon?: string | null; description?: string | null };

export default function PropertyGrid({
  properties: initialProperties,
  propertyTypes = [],
}: {
  properties: any[];
  /** Canonical type list from app_settings — drives the filter dropdown
   *  so newly-added types show up even before any property has them.
   *  Falls back to data-derived names when empty. */
  propertyTypes?: SettingsPropertyType[];
}) {
  const [properties, setProperties] = useState<any[]>(initialProperties);

  // Lookup map name → icon for fast card rendering
  const router = useRouter();
  const typeIconMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of propertyTypes) {
      if (t.name) m.set(t.name.toLowerCase(), (t.icon || "").trim());
    }
    return m;
  }, [propertyTypes]);

  const iconFor = (name: string | null | undefined): string => {
    const fromSettings = name ? typeIconMap.get(name.toLowerCase()) : null;
    return (fromSettings && fromSettings.length > 0) ? fromSettings : fallbackIcon(name);
  };
  const [selectedProperty, setSelectedProperty] = useState<any>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- FILTERS ---
  const [search, setSearch] = useState("");
  const [priceMin, setPriceMin] = useState<string>("");
  const [priceMax, setPriceMax] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string>("");
  const [builderFilter, setBuilderFilter] = useState<string>("");
  const [bedsMin, setBedsMin] = useState<number>(0);
  const [bathsMin, setBathsMin] = useState<number>(0);
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(true);

  // Build filter dropdown options from the loaded data so they match
  // what's actually in the database.
  const stateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      const s = (p.state || "").toString().trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort();
  }, [properties]);

  const builderOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of properties) {
      const b = (p.builder_name || "").toString().trim();
      if (b) set.add(b);
    }
    return Array.from(set).sort();
  }, [properties]);

  // Settings list takes precedence so newly-added types are visible
  // even before any property has been classified as them yet. Fall
  // back to data-derived names if the settings list is empty for some
  // reason (e.g. fetch failed).
  const propertyTypeOptions = useMemo(() => {
    if (propertyTypes && propertyTypes.length > 0) {
      return propertyTypes.map((t) => t.name).filter(Boolean);
    }
    const set = new Set<string>();
    for (const p of properties) {
      const t = (p.property_type || "").toString().trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort();
  }, [properties, propertyTypes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minP = priceMin ? Number(priceMin) : null;
    const maxP = priceMax ? Number(priceMax) : null;

    return properties.filter((p) => {
      if (q) {
        const haystack = [
          p.suburb, p.builder_name, p.estate_name, p.street_address,
          p.address_street, p.address_suburb, p.lot_number, p.state,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      const price = p.total_package_price ?? p.house_price ?? null;
      if (minP != null && (price == null || price < minP)) return false;
      if (maxP != null && (price == null || price > maxP)) return false;
      if (stateFilter && (p.state || "").toString().trim() !== stateFilter) return false;
      if (builderFilter && (p.builder_name || "").toString().trim() !== builderFilter) return false;
      if (propertyTypeFilter && (p.property_type || "").toString().trim() !== propertyTypeFilter) return false;
      if (bedsMin > 0 && (Number(p.bedrooms) || 0) < bedsMin) return false;
      if (bathsMin > 0 && (Number(p.bathrooms) || 0) < bathsMin) return false;
      return true;
    });
  }, [properties, search, priceMin, priceMax, stateFilter, builderFilter, propertyTypeFilter, bedsMin, bathsMin]);

  const activeFilterCount =
    (search ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0) +
    (stateFilter ? 1 : 0) +
    (builderFilter ? 1 : 0) +
    (propertyTypeFilter ? 1 : 0) +
    (bedsMin > 0 ? 1 : 0) +
    (bathsMin > 0 ? 1 : 0);

  const clearFilters = () => {
    setSearch(""); setPriceMin(""); setPriceMax("");
    setStateFilter(""); setBuilderFilter(""); setPropertyTypeFilter("");
    setBedsMin(0); setBathsMin(0);
  };

  // --- EMPOWER MATH VARIABLES ---
  const [interestRate, setInterestRate] = useState<number>(6.5);
  const [growthRate, setGrowthRate] = useState<number>(5.0);
  const rentYield = 0.05;

  // --- REAL-TIME CALCULATIONS ---
  let weeklyRent = 0;
  let weeklyCashflow = 0;
  let tenYearValue = 0;
  let tenYearEquity = 0;

  const displayPrice = selectedProperty?.total_package_price || selectedProperty?.house_price;
  if (selectedProperty && displayPrice) {
    const price = displayPrice;
    weeklyRent = (price * rentYield) / 52;
    const annualInterestCost = price * (interestRate / 100);
    const weeklyInterestCost = annualInterestCost / 52;
    weeklyCashflow = weeklyRent - weeklyInterestCost;
    tenYearValue = price * Math.pow((1 + (growthRate / 100)), 10);
    tenYearEquity = tenYearValue - price;
  }

  // --- CHECKBOX HELPERS ---
  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    // Operates on the currently-visible (filtered) set so "select all"
    // does what the user expects when they've narrowed by suburb etc.
    const visibleIds = filtered.map((p) => p.id);
    const allVisibleChecked = visibleIds.every((id) => checkedIds.has(id));
    if (allVisibleChecked) {
      setCheckedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setCheckedIds(prev => new Set([...prev, ...visibleIds]));
    }
  };

  // --- DELETE ---
  const executeDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await fetch("/api/properties/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: confirmDelete.ids }),
      });
      setProperties(prev => prev.filter(p => !confirmDelete.ids.includes(p.id)));
      setCheckedIds(prev => { const n = new Set(prev); confirmDelete.ids.forEach(id => n.delete(id)); return n; });
      if (selectedProperty && confirmDelete.ids.includes(selectedProperty.id)) setSelectedProperty(null);
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  // --- PDF ---
  const generatePDF = () => {
    if (!selectedProperty) return;
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(41, 128, 185);
    doc.text("Empower Wealth Projection", 20, 30);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Property: ${selectedProperty.street_address}, ${selectedProperty.suburb}`, 20, 45);
    doc.text(`Purchase Price: $${(selectedProperty.total_package_price || selectedProperty.house_price)?.toLocaleString()}`, 20, 55);
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Interest Rate Assumption: ${interestRate}% (Interest Only)`, 20, 70);
    doc.text(`Capital Growth Assumption: ${growthRate}% per annum`, 20, 78);
    doc.setFontSize(16);
    doc.setTextColor(44, 62, 80);
    doc.text("10-Year Financial Forecast", 20, 95);
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`Estimated Weekly Rent: $${Math.round(weeklyRent)}`, 20, 105);
    if (weeklyCashflow >= 0) doc.setTextColor(39, 174, 96);
    else doc.setTextColor(192, 57, 43);
    doc.text(`Weekly Cashflow: ${weeklyCashflow >= 0 ? '+' : ''}$${Math.round(weeklyCashflow)}`, 20, 115);
    doc.setTextColor(142, 68, 173);
    doc.text(`Estimated 10-Year Equity: +$${Math.round(tenYearEquity).toLocaleString()}`, 20, 125);
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by PropertyMarketer CRM", 20, 280);
    doc.save(`Wealth_Report_${(selectedProperty.street_address || selectedProperty.suburb || 'Property').replace(/\s+/g, '_')}.pdf`);
  };

  const visibleCheckedCount = filtered.reduce((n, p) => n + (checkedIds.has(p.id) ? 1 : 0), 0);
  const allChecked = filtered.length > 0 && visibleCheckedCount === filtered.length;
  const someChecked = visibleCheckedCount > 0 && visibleCheckedCount < filtered.length;

  return (
    <>
      {/* Confirm delete dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Delete {confirmDelete.label}?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">This will remove it from the aggregator feed permanently.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
                Cancel
              </button>
              <button onClick={executeDelete} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-60 transition">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-4 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <input
              type="text"
              placeholder="🔍  Search suburb, builder, estate, address, lot…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-md px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold transition flex items-center gap-1.5"
            >
              {showFilters ? "▾" : "▸"} Filters
              {activeFilterCount > 0 && (
                <span className="bg-blue-600 text-white px-1.5 rounded-full text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-500 hover:text-red-600 font-medium transition"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="text-xs text-gray-500 ml-3 whitespace-nowrap">
            <strong className="text-gray-800">{filtered.length}</strong>
            {filtered.length !== properties.length && (
              <span className="text-gray-400"> of {properties.length}</span>
            )}{" "}
            properties
          </div>
        </div>

        {showFilters && (
          <div className="border-t border-gray-100 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Price range */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Price range
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <span className="text-gray-400 text-sm">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {[
                  ["<$500k", "", "500000"],
                  ["$500-700k", "500000", "700000"],
                  ["$700-900k", "700000", "900000"],
                  ["$900k-1.2M", "900000", "1200000"],
                  ["$1.2M+", "1200000", ""],
                ].map(([lbl, mn, mx]) => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => { setPriceMin(mn); setPriceMax(mx); }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 transition"
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* State */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                State
              </label>
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All states</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Builder */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Builder / estate
              </label>
              <select
                value={builderFilter}
                onChange={(e) => setBuilderFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All builders</option>
                {builderOptions.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>

            {/* Property type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Property type
              </label>
              <select
                value={propertyTypeFilter}
                onChange={(e) => setPropertyTypeFilter(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All types</option>
                {propertyTypeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Bedrooms */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Bedrooms
              </label>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBedsMin(n)}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition ${
                      bedsMin === n
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {n === 0 ? "Any" : `${n}+`}
                  </button>
                ))}
              </div>
            </div>

            {/* Bathrooms */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Bathrooms
              </label>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBathsMin(n)}
                    className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg border transition ${
                      bathsMin === n
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {n === 0 ? "Any" : `${n}+`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = someChecked; }}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            {checkedIds.size > 0 ? `${checkedIds.size} selected` : `Select all (${filtered.length})`}
          </label>
        </div>
        {checkedIds.size > 0 && (
          <button
            onClick={() => setConfirmDelete({ ids: Array.from(checkedIds), label: `${checkedIds.size} propert${checkedIds.size !== 1 ? "ies" : "y"}` })
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
          >
            🗑️ Delete {checkedIds.size}
          </button>
        )}
        {checkedIds.size >= 2 && (
          <button
            onClick={() => {
              // Save selected IDs to localStorage
              localStorage.setItem("comparedProperties", JSON.stringify(Array.from(checkedIds)));
              // Navigate to compare page
              router.push("/compare");
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            🔍 Compare {checkedIds.size}
          </button>
        )}
      </div>
