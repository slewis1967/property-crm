"use client";

/**
 * The page a client opens to look at the properties their consultant picked.
 *
 * Design intent: a buyer comparing a handful of homes on their phone. Five tabs,
 * each answering one question — "what are they?", "how do they stack up?",
 * "what will it cost me?", "what are the suburbs like?", "who do I talk to?".
 * The cost figures recompute as the client moves the deposit or rate, using the
 * same pure calculation the server uses (utils/property-shortlist.ts).
 *
 * Nothing here can identify the builder or estate: the API sends the masked
 * view only, and photos come through a token-scoped route by index.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  computeReport,
  CLIENT_NOTE_MAX,
  type ClientProperty,
  type ClientResponse,
  type PropertyReport,
  type ShortlistAssumptions,
} from "../../../utils/property-shortlist";

const NAVY = "#1b1f44";
const AMBER = "#da9845";

type Payload = {
  clientFirstName: string;
  title: string | null;
  message: string | null;
  consultantName: string | null;
  assumptions: ShortlistAssumptions;
  bookingPath: string | null;
  expiresAt: string;
  properties: ClientProperty[];
  suburbs: { suburb: string; state: string | null }[];
  disclaimer: string;
};

type Tab = "homes" | "compare" | "costs" | "suburbs" | "talk";
const TABS: { id: Tab; label: string }[] = [
  { id: "homes", label: "Properties" },
  { id: "compare", label: "Compare" },
  { id: "costs", label: "Costs & cashflow" },
  { id: "suburbs", label: "Suburbs" },
  { id: "talk", label: "Talk to us" },
];

const money = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `$${Math.round(n).toLocaleString("en-AU")}`;
const signedMoney = (n: number | null) =>
  n === null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-AU")}`;
const size = (n: number | null) => (n === null ? "—" : `${Math.round(n).toLocaleString("en-AU")} m²`);

function headline(p: ClientProperty): string {
  const beds = p.bedrooms ? `${p.bedrooms} bed ` : "";
  return `${beds}${p.propertyType ?? "Property"}`;
}

function place(p: Pick<ClientProperty, "suburb" | "state">): string {
  return [p.suburb, p.state].filter(Boolean).join(", ") || "Location on request";
}

const AVAILABILITY: Record<ClientProperty["availability"], { label: string; cls: string }> = {
  available: { label: "Available", cls: "bg-emerald-100 text-emerald-800" },
  on_hold: { label: "On hold", cls: "bg-amber-100 text-amber-800" },
  unavailable: { label: "No longer available", cls: "bg-gray-200 text-gray-600" },
};

export default function ShortlistClient({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("homes");
  const [assumptions, setAssumptions] = useState<ShortlistAssumptions | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shortlist/${encodeURIComponent(token)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setLoadError(json.error || "This link isn't working. Please contact your NextKey consultant.");
          return;
        }
        setData(json.shortlist as Payload);
        setAssumptions((json.shortlist as Payload).assumptions);
      } catch {
        if (!cancelled) setLoadError("We couldn't load your properties. Check your connection and try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const updateProperty = useCallback((itemId: string, patch: Partial<ClientProperty>) => {
    setData((d) =>
      d ? { ...d, properties: d.properties.map((p) => (p.itemId === itemId ? { ...p, ...patch } : p)) } : d,
    );
  }, []);

  const reports = useMemo(() => {
    const map = new Map<string, PropertyReport | null>();
    if (!data || !assumptions) return map;
    for (const p of data.properties) {
      map.set(
        p.itemId,
        computeReport(
          { price: p.price, landPrice: p.landPrice, contract: p.contract, state: p.state, rentWeekly: p.rentWeekly },
          assumptions,
        ),
      );
    }
    return map;
  }, [data, assumptions]);

  if (loadError) {
    return (
      <Frame>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-lg font-semibold" style={{ color: NAVY }}>
            {loadError}
          </p>
        </div>
      </Frame>
    );
  }
  if (!data || !assumptions) {
    return (
      <Frame>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Loading your properties…
        </div>
      </Frame>
    );
  }

  const interested = data.properties.filter((p) => p.response === "interested").length;

  return (
    <Frame>
      <div className="mb-5">
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>
          {data.title || (data.clientFirstName ? `${data.clientFirstName}, here are your properties` : "Your properties")}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {data.properties.length} {data.properties.length === 1 ? "property" : "properties"} picked for you
          {data.consultantName ? ` by ${data.consultantName}` : ""}
          {interested > 0 ? ` · you've marked ${interested} as interested` : ""}
        </p>
        {data.message && (
          <div
            className="mt-4 bg-white rounded-lg border-l-4 p-4 text-sm text-gray-700 whitespace-pre-wrap"
            style={{ borderColor: AMBER }}
          >
            {data.message}
          </div>
        )}
      </div>

      <nav className="flex gap-1 overflow-x-auto mb-5 -mx-1 px-1 pb-1" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap px-3.5 py-2 rounded-full text-sm font-semibold transition ${
              tab === t.id ? "text-white" : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
            style={tab === t.id ? { background: NAVY } : undefined}
            aria-current={tab === t.id ? "page" : undefined}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "homes" && (
        <div className="space-y-5">
          {data.properties.map((p) => (
            <PropertyCard
              key={p.itemId}
              token={token}
              property={p}
              report={reports.get(p.itemId) ?? null}
              onUpdate={updateProperty}
            />
          ))}
        </div>
      )}

      {tab === "compare" && <CompareTable properties={data.properties} reports={reports} />}

      {tab === "costs" && (
        <CostsTab
          properties={data.properties}
          reports={reports}
          assumptions={assumptions}
          onChange={setAssumptions}
          onReset={() => setAssumptions(data.assumptions)}
        />
      )}

      {tab === "suburbs" && <SuburbsTab token={token} suburbs={data.suburbs} />}

      {tab === "talk" && (
        <TalkTab bookingPath={data.bookingPath} consultantName={data.consultantName} interested={interested} />
      )}

      <p className="text-[11px] leading-relaxed text-gray-400 mt-8">{data.disclaimer}</p>
      <p className="text-[11px] text-gray-400 mt-2">
        This private link works until{" "}
        {new Date(data.expiresAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" })}.
      </p>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-gray-50">
      <header style={{ background: NAVY, borderBottom: `4px solid ${AMBER}` }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-lg font-bold text-white">
            Next<span style={{ color: AMBER }}>Key</span>
          </span>
          <span className="text-xs text-white/70">Property Strategists</span>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

// ── Properties ─────────────────────────────────────────────────────────────────

function PropertyCard({
  token,
  property: p,
  report,
  onUpdate,
}: {
  token: string;
  property: ClientProperty;
  report: PropertyReport | null;
  onUpdate: (itemId: string, patch: Partial<ClientProperty>) => void;
}) {
  const [photo, setPhoto] = useState(0);
  const [note, setNote] = useState(p.clientNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const avail = AVAILABILITY[p.availability];

  async function respond(response: ClientResponse | null) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/shortlist/${encodeURIComponent(token)}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: p.itemId, response, note: note.trim() || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || "Couldn't save that. Please try again.");
      onUpdate(p.itemId, { response, clientNote: note.trim() || null, respondedAt: json.respondedAt ?? null });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-5">
        <div className="md:col-span-2 bg-gray-100 relative">
          {p.imageCount > 0 ? (
            <>
              <Image
                src={`/api/shortlist/${encodeURIComponent(token)}/image?item=${p.itemId}&n=${photo}`}
                alt={`${headline(p)} — photo ${photo + 1} of ${p.imageCount}`}
                width={800}
                height={600}
                unoptimized
                className="w-full aspect-[4/3] object-cover"
              />
              {p.imageCount > 1 && (
                <div className="absolute bottom-2 inset-x-0 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhoto((i) => (i - 1 + p.imageCount) % p.imageCount)}
                    className="w-8 h-8 rounded-full bg-black/50 text-white"
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                  <span className="px-2 py-1 rounded-full bg-black/50 text-white text-xs self-center">
                    {photo + 1}/{p.imageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhoto((i) => (i + 1) % p.imageCount)}
                    className="w-8 h-8 rounded-full bg-black/50 text-white"
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="w-full aspect-[4/3] flex items-center justify-center text-5xl text-gray-300">🏠</div>
          )}
        </div>

        <div className="md:col-span-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold" style={{ color: NAVY }}>
                {headline(p)}
              </h2>
              <p className="text-sm text-gray-500">
                {place(p)} · <span className="text-gray-400">Ref {p.ref}</span>
              </p>
            </div>
            <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${avail.cls}`}>{avail.label}</span>
          </div>

          <p className="text-2xl font-bold mt-3" style={{ color: NAVY }}>
            {money(p.price)}
          </p>
          {p.landPrice && p.buildPrice && (
            <p className="text-xs text-gray-500">
              Land {money(p.landPrice)} + build {money(p.buildPrice)}
            </p>
          )}

          <dl className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-4 text-sm">
            <Spec label="Bedrooms" value={p.bedrooms ?? "—"} />
            <Spec label="Bathrooms" value={p.bathrooms ?? "—"} />
            <Spec label="Car" value={p.carSpaces ?? "—"} />
            <Spec label="Study" value={p.study ? "Yes" : "—"} />
            <Spec label="Home" value={size(p.houseSizeSqm)} />
            <Spec label="Land" value={size(p.landSizeSqm)} />
            <Spec label="Est. rent" value={p.rentWeekly ? `${money(p.rentWeekly)}/wk` : "—"} />
            <Spec label="Gross yield" value={report?.grossYieldPct != null ? `${report.grossYieldPct}%` : "—"} />
          </dl>

          {(p.completion || p.titled !== null || p.contract) && (
            <p className="text-xs text-gray-500 mt-3">
              {[p.contract, p.titled === true ? "Titled land" : p.titled === false ? "Land not yet titled" : null, p.completion ? `Completion: ${p.completion}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}

          {p.staffNote && (
            <p className="mt-3 text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
              <span className="font-semibold" style={{ color: NAVY }}>
                Why we picked it:{" "}
              </span>
              {p.staffNote}
            </p>
          )}

          <div className="mt-4 border-t border-gray-100 pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">What do you think?</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => respond(p.response === "interested" ? null : "interested")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50 ${
                  p.response === "interested"
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-emerald-50"
                }`}
                aria-pressed={p.response === "interested"}
              >
                👍 I&apos;m interested
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => respond(p.response === "not_for_me" ? null : "not_for_me")}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition disabled:opacity-50 ${
                  p.response === "not_for_me"
                    ? "bg-gray-700 border-gray-700 text-white"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                }`}
                aria-pressed={p.response === "not_for_me"}
              >
                Not for me
              </button>
            </div>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value.slice(0, CLIENT_NOTE_MAX));
                setSaved(false);
              }}
              rows={2}
              placeholder="Anything you'd like to ask or tell us about this one? (optional)"
              className="mt-2 w-full text-sm border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-amber-300"
            />
            <div className="flex items-center gap-3 mt-1">
              {p.response && note.trim() !== (p.clientNote ?? "") && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => respond(p.response)}
                  className="text-xs font-semibold underline disabled:opacity-50"
                  style={{ color: NAVY }}
                >
                  Save note
                </button>
              )}
              {!p.response && note.trim() && (
                <span className="text-xs text-gray-400">Pick an option above to send your note.</span>
              )}
              {saving && <span className="text-xs text-gray-400">Saving…</span>}
              {saved && !saving && <span className="text-xs text-emerald-700">Thanks — we&apos;ve let your consultant know.</span>}
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Spec({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

// ── Compare ───────────────────────────────────────────────────────────────────────

function CompareTable({
  properties,
  reports,
}: {
  properties: ClientProperty[];
  reports: Map<string, PropertyReport | null>;
}) {
  const rows: { label: string; value: (p: ClientProperty, r: PropertyReport | null) => React.ReactNode }[] = [
    { label: "Location", value: (p) => place(p) },
    { label: "Type", value: (p) => p.propertyType ?? "—" },
    { label: "Availability", value: (p) => AVAILABILITY[p.availability].label },
    { label: "Price", value: (p) => money(p.price) },
    { label: "Land price", value: (p) => money(p.landPrice) },
    { label: "Build price", value: (p) => money(p.buildPrice) },
    { label: "Bedrooms", value: (p) => p.bedrooms ?? "—" },
    { label: "Bathrooms", value: (p) => p.bathrooms ?? "—" },
    { label: "Car spaces", value: (p) => p.carSpaces ?? "—" },
    { label: "Study", value: (p) => (p.study ? "Yes" : "—") },
    { label: "Home size", value: (p) => size(p.houseSizeSqm) },
    { label: "Land size", value: (p) => size(p.landSizeSqm) },
    { label: "Frontage", value: (p) => (p.frontageM ? `${p.frontageM} m` : "—") },
    { label: "Price per m² (home)", value: (p) => (p.price && p.houseSizeSqm ? money(p.price / p.houseSizeSqm) : "—") },
    { label: "Est. rent / week", value: (p) => (p.rentWeekly ? money(p.rentWeekly) : "—") },
    { label: "Gross yield", value: (_p, r) => (r?.grossYieldPct != null ? `${r.grossYieldPct}%` : "—") },
    { label: "Stamp duty (est.)", value: (_p, r) => money(r?.duty) },
    { label: "Upfront cash (est.)", value: (_p, r) => money(r?.upfrontCash) },
    { label: "Repayment / month", value: (_p, r) => money(r?.monthlyRepayment) },
    { label: "Cashflow / week (pre-tax)", value: (_p, r) => signedMoney(r?.weeklyCashflow ?? null) },
    { label: "Titled", value: (p) => (p.titled === true ? "Yes" : p.titled === false ? "No" : "—") },
    { label: "Completion", value: (p) => p.completion ?? "—" },
    { label: "Your view", value: (p) => (p.response === "interested" ? "👍 Interested" : p.response === "not_for_me" ? "Not for me" : "—") },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr style={{ background: NAVY }} className="text-white">
            <th className="text-left px-3 py-2 font-semibold sticky left-0" style={{ background: NAVY }}>
              &nbsp;
            </th>
            {properties.map((p) => (
              <th key={p.itemId} className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                {headline(p)}
                <div className="text-[11px] font-normal text-white/70">Ref {p.ref}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.label} className={i % 2 ? "bg-gray-50" : "bg-white"}>
              <th
                className={`text-left px-3 py-2 font-medium text-gray-500 whitespace-nowrap sticky left-0 ${i % 2 ? "bg-gray-50" : "bg-white"}`}
              >
                {row.label}
              </th>
              {properties.map((p) => (
                <td key={p.itemId} className="px-3 py-2 text-gray-900 whitespace-nowrap">
                  {row.value(p, reports.get(p.itemId) ?? null)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400 px-3 py-2">
        Cost and cashflow rows use the assumptions on the Costs &amp; cashflow tab.
      </p>
    </div>
  );
}

// ── Costs & cashflow ─────────────────────────────────────────────────────────────

function CostsTab({
  properties,
  reports,
  assumptions: a,
  onChange,
  onReset,
}: {
  properties: ClientProperty[];
  reports: Map<string, PropertyReport | null>;
  assumptions: ShortlistAssumptions;
  onChange: (a: ShortlistAssumptions) => void;
  onReset: () => void;
}) {
  const set = <K extends keyof ShortlistAssumptions>(k: K, v: ShortlistAssumptions[K]) => onChange({ ...a, [k]: v });
  const num = (v: string, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
  };

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold" style={{ color: NAVY }}>
            Your assumptions
          </h2>
          <button type="button" onClick={onReset} className="text-xs font-semibold underline" style={{ color: NAVY }}>
            Reset
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
          <Field label="Deposit %">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={a.depositPct}
              onChange={(e) => set("depositPct", num(e.target.value, 0, 100))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5"
            />
          </Field>
          <Field label="Interest rate %">
            <input
              type="number"
              min={0}
              max={20}
              step={0.05}
              value={a.interestRatePct}
              onChange={(e) => set("interestRatePct", num(e.target.value, 0, 20))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5"
            />
          </Field>
          <Field label="Loan term (years)">
            <input
              type="number"
              min={1}
              max={40}
              step={1}
              value={a.loanTermYears}
              onChange={(e) => set("loanTermYears", Math.round(num(e.target.value, 1, 40)))}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5"
            />
          </Field>
          <Field label="Repayments">
            <select
              value={a.repayment}
              onChange={(e) => set("repayment", e.target.value === "io" ? "io" : "pi")}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="pi">Principal &amp; interest</option>
              <option value="io">Interest only</option>
            </select>
          </Field>
          <Field label="First home buyer">
            <label className="flex items-center gap-2 py-1.5">
              <input type="checkbox" checked={a.firstHomeBuyer} onChange={(e) => set("firstHomeBuyer", e.target.checked)} />
              <span>{a.firstHomeBuyer ? "Yes" : "No"}</span>
            </label>
          </Field>
        </div>
        {a.depositPct < 20 && (
          <p className="text-xs text-amber-700 mt-3">
            With less than a 20% deposit, lenders usually charge lenders&apos; mortgage insurance (LMI). It isn&apos;t included below.
          </p>
        )}
      </section>

      {properties.map((p) => {
        const r = reports.get(p.itemId) ?? null;
        return (
          <section key={p.itemId} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-bold" style={{ color: NAVY }}>
              {headline(p)} <span className="font-normal text-gray-500">· {place(p)}</span>
            </h3>
            {!r ? (
              <p className="text-sm text-gray-500 mt-2">We need a confirmed price before we can estimate costs for this one.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">Upfront</p>
                  <Line label={`Deposit (${a.depositPct}%)`} value={money(r.deposit)} />
                  <Line
                    label={
                      r.duty === null
                        ? "Stamp duty"
                        : `Stamp duty (est., on ${r.dutyBasis === "land" ? "land price" : "full price"}${a.firstHomeBuyer ? ", first home buyer" : ""})`
                    }
                    value={r.duty === null ? "Ask us" : money(r.duty)}
                  />
                  <Line label="Legal & settlement (allowance)" value={money(r.closingCosts)} />
                  <Line label="Total cash needed (est.)" value={money(r.upfrontCash)} strong />
                  <Line label="Loan amount" value={money(r.loan)} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-2">Each year (as an investment)</p>
                  {r.annualRent === null ? (
                    <p className="text-gray-500">
                      We don&apos;t have a rent estimate for this one yet — ask us and we&apos;ll get one.
                    </p>
                  ) : (
                    <>
                      <Line
                        label={`Rent (${money(r.rentWeekly)}/wk${p.rentSource === "consultant" ? ", our estimate" : ""})`}
                        value={money(r.annualRent)}
                      />
                      <Line label="Gross yield" value={`${r.grossYieldPct}%`} />
                      <Line label="Running costs (allowance)" value={`−${money(r.annualCosts)}`} />
                    </>
                  )}
                  <Line
                    label={`Repayments (${a.repayment === "io" ? "interest only" : "P&I"}, ${a.interestRatePct}%)`}
                    value={`−${money(r.annualRepayments)}`}
                  />
                  <Line label="Monthly repayment" value={money(r.monthlyRepayment)} />
                  {r.weeklyCashflow !== null && (
                    <Line
                      label="Cashflow per week (before tax)"
                      value={signedMoney(r.weeklyCashflow)}
                      strong
                      tone={r.weeklyCashflow >= 0 ? "good" : "bad"}
                    />
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}
      <p className="text-xs text-gray-500">
        Running costs are an allowance for property management, vacancy, council rates, insurance and maintenance
        (the greater of 25% of rent or 0.9% of the price). Cashflow is before tax, depreciation and any tax refunds.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-gray-400 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-gray-900";
  return (
    <div className={`flex justify-between gap-3 py-1 ${strong ? "border-t border-gray-100 mt-1 pt-2" : ""}`}>
      <span className="text-gray-600">{label}</span>
      <span className={`${strong ? "font-bold" : "font-medium"} ${color} whitespace-nowrap`}>{value}</span>
    </div>
  );
}

// ── Suburbs ──────────────────────────────────────────────────────────────────────

type SuburbProfile = {
  intel: {
    medianPrice: number | null;
    priceGrowthPct: number | null;
    population: number | null;
    keyInfrastructure: string[];
    lastUpdated: string | null;
  } | null;
  narrative: string | null;
};

function SuburbsTab({ token, suburbs }: { token: string; suburbs: { suburb: string; state: string | null }[] }) {
  if (suburbs.length === 0) {
    return <p className="text-sm text-gray-500">No suburb information for these properties yet.</p>;
  }
  return (
    <div className="space-y-5">
      {suburbs.map((s) => (
        <SuburbCard key={`${s.suburb}|${s.state ?? ""}`} token={token} suburb={s.suburb} state={s.state} />
      ))}
    </div>
  );
}

function SuburbCard({ token, suburb, state }: { token: string; suburb: string; state: string | null }) {
  const [profile, setProfile] = useState<SuburbProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = new URLSearchParams({ suburb, state: state ?? "" });
        const res = await fetch(`/api/shortlist/${encodeURIComponent(token)}/suburb?${qs}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error || "We couldn't load this suburb profile right now.");
          return;
        }
        setProfile({ intel: json.intel, narrative: json.narrative });
      } catch {
        if (!cancelled) setError("We couldn't load this suburb profile right now.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, suburb, state]);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-bold" style={{ color: NAVY }}>
        {suburb}
        {state ? `, ${state}` : ""}
      </h2>
      {error && <p className="text-sm text-gray-500 mt-2">{error}</p>}
      {!error && !profile && (
        <p className="text-sm text-gray-400 mt-2">Researching {suburb}… this can take up to half a minute the first time.</p>
      )}
      {profile?.intel && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 text-sm">
          <Spec label="Median price" value={money(profile.intel.medianPrice)} />
          <Spec
            label="Price growth (past)"
            value={profile.intel.priceGrowthPct != null ? `${profile.intel.priceGrowthPct}%` : "—"}
          />
          <Spec
            label="Population"
            value={profile.intel.population != null ? profile.intel.population.toLocaleString("en-AU") : "—"}
          />
        </dl>
      )}
      {profile?.intel?.keyInfrastructure?.length ? (
        <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-0.5">
          {profile.intel.keyInfrastructure.map((k) => (
            <li key={k}>{k}</li>
          ))}
        </ul>
      ) : null}
      {profile?.narrative && <Narrative text={profile.narrative} />}
      {profile && !profile.narrative && !profile.intel && (
        <p className="text-sm text-gray-500 mt-2">A profile for this suburb isn&apos;t available yet — ask us and we&apos;ll send one.</p>
      )}
    </section>
  );
}

/** Renders the narrative's **headings** and bullets as React nodes — never as HTML. */
function Narrative({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-0.5">
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*[-•*]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^\*\*[^*]+\*\*$/.test(part) ? (
          <strong key={i} style={{ color: NAVY }}>
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ── Talk to us ───────────────────────────────────────────────────────────────────

function TalkTab({
  bookingPath,
  consultantName,
  interested,
}: {
  bookingPath: string | null;
  consultantName: string | null;
  interested: number;
}) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold" style={{ color: NAVY }}>
        Let&apos;s talk them through
      </h2>
      <p className="text-sm text-gray-600 mt-2">
        {interested > 0
          ? `You've marked ${interested} ${interested === 1 ? "property" : "properties"} as interesting. `
          : ""}
        Book a time with {consultantName ?? "your NextKey consultant"} to go through the numbers, the suburbs and the next
        steps. There&apos;s no obligation.
      </p>
      {bookingPath ? (
        <a
          href={bookingPath}
          target="_blank"
          rel="noopener"
          className="inline-block mt-4 px-5 py-3 rounded-lg text-white font-semibold"
          style={{ background: AMBER }}
        >
          📅 Book a call
        </a>
      ) : (
        <p className="text-sm text-gray-600 mt-4">Reply to the email this link came in and we&apos;ll be in touch.</p>
      )}
      <p className="text-xs text-gray-400 mt-4">You can also just reply to the email this link came in.</p>
    </section>
  );
}
