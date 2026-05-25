"use client";

import { useEffect, useMemo, useState } from "react";
import { runPia, type PiaInputs } from "@/app/pia/_calc";
import type { AssumptionSource } from "@/utils/deal-packet";

/**
 * Per-property PIA assumptions editor + report generation.
 *
 * The full PIA model is editable: key figures inline, the rest behind "Advanced".
 * "Research market figures" web-searches the factual costs (interest, stamp duty,
 * rates, insurance) and marks them as sourced. "Save & regenerate" persists the
 * assumptions and rebuilds the report (idempotent). Co-living rent is entered
 * per-room; gross weekly = room_rent × rooms. Growth stays the conservative default
 * unless deliberately changed in Advanced — the report frames it as an assumption.
 */

interface Prop {
  index: number;
  suburb: string | null;
  address: string | null;
  is_co_living: boolean;
  per_room: boolean;
  rooms: number | null;
  room_rent: number | null;
  price: number | null;
  bathrooms: number | null;
  land: number | null;
  contract_type: "single" | "dual";
  land_price: number | null;
  pia: PiaInputs;
  sources: AssumptionSource[];
}
interface ReportLink { id: string; kind: string; label: string }

const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

// field key → label + unit. Rent + price are handled specially (price is first).
const KEY_FIELDS: { key: keyof PiaInputs; label: string; unit: "$" | "%" | "$/yr" | "yr" }[] = [
  { key: "interestRate", label: "Interest rate", unit: "%" },
  { key: "loanAmount", label: "Loan amount", unit: "$" },
  { key: "stampDuty", label: "Stamp duty", unit: "$" },
  { key: "rates", label: "Council rates", unit: "$/yr" },
  { key: "insurance", label: "Landlord insurance", unit: "$/yr" },
  { key: "marginalTaxRate", label: "Marginal tax rate", unit: "%" },
  { key: "holdingYears", label: "Holding period", unit: "yr" },
];
const ADVANCED_FIELDS: { key: keyof PiaInputs; label: string; unit: "$" | "%" | "$/yr" | "wk" | "yr" }[] = [
  { key: "capitalGrowth", label: "Capital growth p.a.", unit: "%" },
  { key: "rentalGrowth", label: "Rental growth p.a.", unit: "%" },
  { key: "vacancyWeeks", label: "Vacancy", unit: "wk" },
  { key: "managementPct", label: "Mgmt % of rent", unit: "%" },
  { key: "maintenancePct", label: "Maintenance % of rent", unit: "%" },
  { key: "propertyExpenseGrowth", label: "Cost inflation p.a.", unit: "%" },
  { key: "bodyCorporate", label: "Body corp / strata", unit: "$/yr" },
  { key: "legalFees", label: "Legal / conveyancing", unit: "$" },
  { key: "buildingInspection", label: "Building inspection", unit: "$" },
  { key: "lenderFees", label: "Lender / setup fees", unit: "$" },
  { key: "otherAcquisition", label: "Other acquisition", unit: "$" },
  { key: "loanTermYears", label: "Loan term", unit: "yr" },
  { key: "ioYears", label: "Interest-only years", unit: "yr" },
  { key: "capitalWorksAnnual", label: "Capital works (Div 43)", unit: "$/yr" },
  { key: "plantEquipmentAnnual", label: "Plant & equip (Div 40)", unit: "$/yr" },
  { key: "plantEquipmentDeclineRate", label: "P&E decline rate", unit: "%" },
];
const SOURCED = new Set(["interestRate", "stampDuty", "rates", "insurance"]);

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
  // Per-property editor state: every PiaInputs field as a string; rent shown separately.
  const initVals = () =>
    Object.fromEntries(
      properties.map((p) => [
        p.index,
        Object.fromEntries(Object.entries(p.pia).map(([k, v]) => [k, String(v)])) as Record<string, string>,
      ]),
    );
  const initRent = () =>
    Object.fromEntries(
      properties.map((p) => [p.index, String(p.per_room ? (p.room_rent ?? Math.round(p.pia.weeklyRent / (p.rooms || 1))) : p.pia.weeklyRent)]),
    );
  const [vals, setVals] = useState<Record<number, Record<string, string>>>(initVals);
  const [rentVals, setRentVals] = useState<Record<number, string>>(initRent);
  const [sources, setSources] = useState<Record<number, AssumptionSource[]>>(
    Object.fromEntries(properties.map((p) => [p.index, p.sources])),
  );
  const [contractType, setContractType] = useState<Record<number, "single" | "dual">>(
    Object.fromEntries(properties.map((p) => [p.index, p.contract_type])),
  );
  const [landPrice, setLandPrice] = useState<Record<number, string>>(
    Object.fromEntries(properties.map((p) => [p.index, p.land_price != null ? String(p.land_price) : ""])),
  );
  const [advOpen, setAdvOpen] = useState<Record<number, boolean>>({});
  const [researching, setResearching] = useState<Record<number, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function propAction(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/deal-analyser/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId, ...body }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed");
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  const num = (s: string): number | null => {
    const v = Number(s);
    return isFinite(v) && v > 0 ? v : null;
  };
  const setField = (i: number, key: string, v: string) => setVals((s) => ({ ...s, [i]: { ...s[i], [key]: v } }));
  const weeklyFor = (p: Prop): number | null => {
    const r = num(rentVals[p.index] ?? "");
    if (r == null) return null;
    return p.per_room ? Math.round(r * (p.rooms ?? 0)) : Math.round(r);
  };
  const sourceFor = (i: number, field: string) => sources[i]?.find((s) => s.field === field) ?? null;

  // Live PIA preview from the current editor state.
  const previewOf = (p: Prop) => {
    const weekly = weeklyFor(p);
    if (weekly == null) return null;
    const inputs: PiaInputs = { ...p.pia };
    for (const k of Object.keys(p.pia)) {
      const v = Number(vals[p.index]?.[k]);
      if (isFinite(v)) (inputs as any)[k] = v;
    }
    inputs.weeklyRent = weekly;
    inputs.purchasePrice = num(vals[p.index]?.purchasePrice ?? "") ?? p.pia.purchasePrice;
    return runPia(inputs);
  };

  const ready = useMemo(() => properties.every((p) => weeklyFor(p) != null), [properties, rentVals]);

  async function research(p: Prop) {
    setResearching((s) => ({ ...s, [p.index]: true }));
    setError(null);
    try {
      const res = await fetch("/api/deal-analyser/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_packet_id: packetId,
          index: p.index,
          contract_type: contractType[p.index],
          land_price: Number(landPrice[p.index]) || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Research failed");
      setVals((s) => ({ ...s, [p.index]: { ...s[p.index], ...Object.fromEntries(Object.entries(j.figures ?? {}).map(([k, v]) => [k, String(v)])) } }));
      setSources((s) => {
        const others = (s[p.index] ?? []).filter((x) => !(j.sources ?? []).some((n: AssumptionSource) => n.field === x.field));
        return { ...s, [p.index]: [...others, ...(j.sources ?? [])] };
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setResearching((s) => ({ ...s, [p.index]: false }));
    }
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const payload = properties.map((p) => {
        const inputs: Record<string, number> = {};
        for (const k of Object.keys(p.pia)) {
          const v = Number(vals[p.index]?.[k]);
          inputs[k] = isFinite(v) ? v : (p.pia as any)[k];
        }
        const weekly = weeklyFor(p);
        if (weekly != null) inputs.weeklyRent = weekly;
        return {
          index: p.index,
          pia_inputs: inputs,
          pia_sources: sources[p.index] ?? [],
          room_rent: p.per_room ? num(rentVals[p.index] ?? "") ?? undefined : undefined,
          contract_type: contractType[p.index],
          land_price: Number(landPrice[p.index]) || null,
        };
      });
      const ar = await fetch("/api/deal-analyser/assumptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId, properties: payload }),
      });
      if (!ar.ok) throw new Error((await ar.json()).error || "Failed to save assumptions");
      const gr = await fetch("/api/deal-analyser/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId }),
      });
      if (!gr.ok) throw new Error((await gr.json()).error || "Failed to generate reports");
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {properties.map((p) => {
        const v = vals[p.index] ?? {};
        const preview = previewOf(p);
        const price = num(v.purchasePrice ?? "") ?? p.pia.purchasePrice;
        const lvr = price > 0 ? (Number(v.loanAmount) / price) * 100 : 0;
        return (
          <div key={p.index} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{p.address ?? p.suburb ?? "Property"}</h3>
                <p className="text-sm text-gray-500">
                  {p.suburb && p.address ? `${p.suburb} · ` : ""}
                  {p.is_co_living ? `Co-living · ${p.rooms ?? "?"} rooms` : "Single tenancy"}
                  {p.bathrooms != null ? ` · ${p.bathrooms} bath` : ""}
                  {p.land != null ? ` · ${p.land} m²` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button title="Move up" disabled={p.index === 0 || busy} onClick={() => propAction({ action: "move", index: p.index, direction: "up" })} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">↑</button>
                <button title="Move down" disabled={p.index === properties.length - 1 || busy} onClick={() => propAction({ action: "move", index: p.index, direction: "down" })} className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30">↓</button>
                <button title="Delete property" disabled={busy} onClick={() => { if (confirm(`Remove ${p.address ?? p.suburb ?? "this property"} from the packet?`)) propAction({ action: "delete", index: p.index }); }} className="w-7 h-7 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-40">✕</button>
                <button
                  onClick={() => research(p)}
                  disabled={!!researching[p.index]}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#0F4C5C0a] disabled:opacity-40"
                >
                  {researching[p.index] ? "Researching…" : "🔎 Research"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <FieldInput label="Package price" unit="$" value={v.purchasePrice ?? ""} onChange={(x) => setField(p.index, "purchasePrice", x)} />
              <FieldInput
                label={p.per_room ? "Rent per room" : "Weekly rent"}
                unit="$/wk"
                value={rentVals[p.index] ?? ""}
                onChange={(x) => setRentVals((s) => ({ ...s, [p.index]: x }))}
              />
              {KEY_FIELDS.map((f) => (
                <FieldInput
                  key={f.key}
                  label={f.label}
                  unit={f.unit}
                  value={v[f.key] ?? ""}
                  sourced={SOURCED.has(f.key) ? sourceFor(p.index, f.key) : null}
                  onChange={(x) => setField(p.index, f.key, x)}
                />
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
              <span>LVR: <strong className="text-gray-800">{isFinite(lvr) ? lvr.toFixed(0) : "—"}%</strong> · deposit {AUD(price - Number(v.loanAmount))}</span>
              {p.per_room && weeklyFor(p) != null && <span>Gross weekly: <strong className="text-gray-800">{AUD(weeklyFor(p))}</strong> ({p.rooms} rooms)</span>}
              {preview && <span>Gross yield <strong className="text-gray-800">{preview.grossYield}%</strong> · net {preview.netYield}% · breakeven {preview.breakevenYear ? `yr ${preview.breakevenYear}` : "beyond term"}</span>}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-500">Contract</span>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
                {(["single", "dual"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setContractType((s) => ({ ...s, [p.index]: c }))}
                    className={`px-3 py-1 ${contractType[p.index] === c ? "text-white" : "text-gray-600"}`}
                    style={contractType[p.index] === c ? { background: "#0F4C5C" } : undefined}
                  >
                    {c === "single" ? "Single" : "Dual (split)"}
                  </button>
                ))}
              </div>
              {contractType[p.index] === "dual" && (
                <label className="text-xs flex items-center gap-2">
                  <span className="text-gray-500">Land price (duty base) $</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={landPrice[p.index] ?? ""}
                    onChange={(e) => setLandPrice((s) => ({ ...s, [p.index]: e.target.value }))}
                    placeholder="e.g. 297000"
                    className="w-32 rounded-lg border border-gray-300 px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                  />
                </label>
              )}
              <span className="text-[11px] text-gray-400">
                {contractType[p.index] === "dual" ? "Stamp duty on land only" : "Stamp duty on house + land"}
              </span>
            </div>

            <button onClick={() => setAdvOpen((s) => ({ ...s, [p.index]: !s[p.index] }))} className="mt-3 text-xs font-semibold text-[#0F4C5C]">
              {advOpen[p.index] ? "▾ Hide advanced" : "▸ Advanced (growth, depreciation, fees…)"}
            </button>
            {advOpen[p.index] && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 border-t border-gray-100 pt-3">
                {ADVANCED_FIELDS.map((f) => (
                  <FieldInput key={f.key} label={f.label} unit={f.unit} value={v[f.key] ?? ""} onChange={(x) => setField(p.index, f.key, x)} />
                ))}
              </div>
            )}

            {(sources[p.index]?.length ?? 0) > 0 && (
              <p className="mt-3 text-[11px] text-gray-400">
                Sourced: {sources[p.index].map((s) => `${s.label} ${s.source} (${s.date})`).join(" · ")}
              </p>
            )}
            {p.per_room && <p className="mt-1 text-[11px] text-gray-400">Rent is an operator estimate attributed to NextKey — not a builder-quoted figure.</p>}
          </div>
        );
      })}

      {addOpen ? (
        <AddPropertyForm
          onAdd={(prop) => propAction({ action: "add", property: prop })}
          onAddStock={(id) => propAction({ action: "add_from_stock", stock_id: id })}
          onClose={() => setAddOpen(false)}
          busy={busy}
        />
      ) : (
        <button onClick={() => setAddOpen(true)} className="text-sm font-medium text-[#0F4C5C] hover:underline">
          + Add a property
        </button>
      )}

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
        onClick={save}
        disabled={busy || !ready}
        className="px-5 py-2.5 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
        style={{ background: "#0F4C5C" }}
      >
        {busy ? "Regenerating…" : existingReports.length > 0 ? "Save changes & regenerate" : "Generate reports"}
      </button>
      {!ready && <span className="ml-3 text-xs text-gray-400">Enter a rent for each property to continue.</span>}
    </div>
  );
}

type StockHit = { id: string; label: string; price: number | null; beds: number | null; baths: number | null; builder: string | null };

function AddPropertyForm({
  onAdd,
  onAddStock,
  onClose,
  busy,
}: {
  onAdd: (p: any) => void;
  onAddStock: (id: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<"manual" | "stock">("manual");
  const [f, setF] = useState<Record<string, string>>({});
  const [coLiving, setCoLiving] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  // Stock search
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<StockHit[]>([]);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (mode !== "stock") return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/deal-analyser/stock-search?q=${encodeURIComponent(q)}`);
        const j = await res.json();
        setHits(res.ok ? j.results ?? [] : []);
      } catch {
        setHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode]);

  return (
    <div className="bg-white rounded-xl border-2 p-5" style={{ borderColor: "#0F4C5C" }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-900">Add a property</h3>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {(["manual", "stock"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 ${mode === m ? "text-white" : "text-gray-600"}`}
              style={mode === m ? { background: "#0F4C5C" } : undefined}
            >
              {m === "manual" ? "Manual entry" : "From stock"}
            </button>
          ))}
        </div>
      </div>

      {mode === "stock" ? (
        <div>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your stock by suburb, address or builder…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <ul className="mt-2 max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
            {searching && <li className="px-3 py-2 text-xs text-gray-400">Searching…</li>}
            {!searching && hits.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">No matches</li>}
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  disabled={busy}
                  onClick={() => onAddStock(h.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 disabled:opacity-40"
                >
                  <span className="text-sm font-medium text-gray-900">{h.label}</span>
                  <span className="block text-xs text-gray-400">
                    {h.price != null ? `$${h.price.toLocaleString("en-AU")}` : "price n/a"}
                    {h.beds != null ? ` · ${h.beds} bed` : ""}
                    {h.baths != null ? ` · ${h.baths} bath` : ""}
                    {h.builder ? ` · ${h.builder}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400">Added from stock with no rent — supply a weekly rent in its card, then regenerate.</p>
          <button onClick={onClose} disabled={busy} className="mt-3 text-sm text-gray-500 hover:text-gray-800">Cancel</button>
        </div>
      ) : (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <AddField label="Address" value={f.address ?? ""} onChange={(v) => set("address", v)} type="text" />
        <AddField label="Suburb" value={f.suburb ?? ""} onChange={(v) => set("suburb", v)} type="text" />
        <AddField label="Package price ($)" value={f.total_price ?? ""} onChange={(v) => set("total_price", v)} />
        <AddField label="Bedrooms" value={f.bedrooms ?? ""} onChange={(v) => set("bedrooms", v)} />
        <AddField label="Bathrooms" value={f.bathrooms ?? ""} onChange={(v) => set("bathrooms", v)} />
        <AddField label="Land (m²)" value={f.land_size_m2 ?? ""} onChange={(v) => set("land_size_m2", v)} />
        <label className="text-xs flex items-end gap-2 pb-1.5">
          <input type="checkbox" checked={coLiving} onChange={(e) => setCoLiving(e.target.checked)} />
          <span className="text-gray-600">Co-living</span>
        </label>
        <AddField label={coLiving ? "Rent per room ($/wk)" : "Weekly rent ($/wk)"} value={f.rent ?? ""} onChange={(v) => set("rent", v)} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          disabled={busy}
          onClick={() =>
            onAdd({
              address: f.address,
              suburb: f.suburb,
              total_price: Number(f.total_price) || null,
              bedrooms: Number(f.bedrooms) || null,
              bathrooms: Number(f.bathrooms) || null,
              land_size_m2: Number(f.land_size_m2) || null,
              is_co_living: coLiving,
              ...(coLiving ? { room_rent: Number(f.rent) || null } : { weekly_rent: Number(f.rent) || null }),
            })
          }
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-40"
          style={{ background: "#0F4C5C" }}
        >
          {busy ? "Adding…" : "Add property"}
        </button>
        <button onClick={onClose} disabled={busy} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
      </div>
      </>
      )}
    </div>
  );
}

function AddField({ label, value, onChange, type = "number" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="text-xs">
      <span className="block text-gray-500 mb-1">{label}</span>
      <input
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
      />
    </label>
  );
}

function FieldInput({
  label,
  unit,
  value,
  onChange,
  sourced,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  sourced?: AssumptionSource | null;
}) {
  return (
    <label className="text-xs">
      <span className="block text-gray-500 mb-1">
        {label} <span className="text-gray-400">({unit})</span>
        {sourced && <span title={`${sourced.source}, ${sourced.date}`}> 🔎</span>}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
      />
    </label>
  );
}
