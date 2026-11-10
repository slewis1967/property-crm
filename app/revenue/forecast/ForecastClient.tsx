"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  costsMonthlyTotal,
  dealNet,
  fmtMoney,
  fmtMonth,
  profitForecast,
  summarise,
  type OperatingCost,
  type RevenueDeal,
} from "../../../utils/revenue";

const TEAL = "#0F4C5C";
const GOLD = "#FFB627";

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  body * { visibility: hidden !important; }
  #revenue-forecast, #revenue-forecast * { visibility: visible !important; }
  #revenue-forecast { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none; }
  .no-print { display: none !important; }
  .fc-page-break { page-break-inside: avoid; }
}
`;

const nnum = (s: string): number => {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};

export default function ForecastClient() {
  const [deals, setDeals] = useState<RevenueDeal[]>([]);
  const [costs, setCosts] = useState<OperatingCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");
  const [preparedFor, setPreparedFor] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch("/api/revenue", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/revenue/costs", { cache: "no-store" }).then((r) => r.json()),
        ]);
        if (!cancelled) {
          if (r1.ok) setDeals(r1.deals ?? []);
          if (r2.ok) setCosts(r2.costs ?? []);
        }
      } catch { /* empty */ }
      if (!cancelled) {
        setLoading(false);
        setGeneratedAt(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function addCost() {
    if (!newLabel.trim()) return;
    try {
      const res = await fetch("/api/revenue/costs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), monthly_amount: nnum(newAmount) }),
      });
      const json = await res.json();
      if (json.ok) { setCosts((c) => [...c, json.cost]); setNewLabel(""); setNewAmount(""); }
    } catch { /* ignore */ }
  }
  async function updateCost(id: string, patch: Partial<OperatingCost>) {
    setCosts((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await fetch(`/api/revenue/costs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    } catch { /* ignore */ }
  }
  async function deleteCost(id: string) {
    const prev = costs;
    setCosts((list) => list.filter((c) => c.id !== id));
    try {
      const res = await fetch(`/api/revenue/costs/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) setCosts(prev);
    } catch { setCosts(prev); }
  }

  const active = deals.filter((d) => d.stage !== "lost");
  const summary = summarise(deals);
  const monthlyCost = costsMonthlyTotal(costs);
  const pf = profitForecast(deals, monthlyCost);
  const scheduled = pf.months.filter((m) => m.month !== "unscheduled");
  const period = scheduled.length > 0 ? `${fmtMonth(scheduled[0].month)} – ${fmtMonth(scheduled[scheduled.length - 1].month)}` : "—";

  if (loading) return <div className="max-w-4xl mx-auto text-sm text-gray-400 py-10">Preparing forecast…</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-4 mb-4 flex-wrap">
        <Link href="/revenue" className="text-sm text-gray-500 hover:text-gray-800">← Back to Revenue</Link>
        <div className="flex items-center gap-2">
          <input value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder="Prepared for… (optional)" className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56" />
          <button onClick={() => window.print()} className="rounded-lg text-white font-semibold px-4 py-2 text-sm" style={{ backgroundColor: TEAL }}>🖨 Print / Save as PDF</button>
        </div>
      </div>

      {/* Operating-costs editor (screen only) */}
      <div className="no-print bg-white border border-gray-200 rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-700">Operating costs <span className="font-normal text-gray-400">(monthly recurring — used to net down to profit)</span></h2>
          <div className="text-sm font-semibold" style={{ color: TEAL }}>{fmtMoney(monthlyCost)}/mo</div>
        </div>
        <div className="space-y-1.5">
          {costs.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <input defaultValue={c.label} onBlur={(e) => e.target.value.trim() && e.target.value !== c.label && updateCost(c.id, { label: e.target.value.trim() })} className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
              <div className="flex items-center gap-1">
                <span className="text-gray-400 text-sm">$</span>
                <input type="number" defaultValue={String(c.monthly_amount)} onBlur={(e) => updateCost(c.id, { monthly_amount: nnum(e.target.value) })} className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
                <span className="text-gray-400 text-xs">/mo</span>
              </div>
              <button onClick={() => deleteCost(c.id)} className="text-gray-300 hover:text-rose-500 text-lg leading-none px-1">×</button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Salaries, Meta ads, Infrastructure" className="flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
            <div className="flex items-center gap-1">
              <span className="text-gray-400 text-sm">$</span>
              <input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" className="w-28 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm" />
              <span className="text-gray-400 text-xs">/mo</span>
            </div>
            <button onClick={addCost} className="rounded-lg text-white text-sm font-semibold px-3 py-1.5" style={{ backgroundColor: TEAL }}>Add</button>
          </div>
        </div>
      </div>

      {/* The document */}
      <div id="revenue-forecast" className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {/* Letterhead */}
        <div className="px-8 pt-8 pb-6" style={{ borderBottom: `3px solid ${GOLD}` }}>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <div className="text-xl font-extrabold tracking-tight" style={{ color: TEAL }}>NextKey Property Strategists</div>
              <div className="text-xs text-gray-500 mt-0.5">Australian property services · SMSF &amp; investment sourcing</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-widest text-gray-400">Cash Flow &amp; Profit Forecast</div>
              <div className="text-sm text-gray-700 mt-0.5">Generated {generatedAt}</div>
              {preparedFor.trim() && <div className="text-sm text-gray-700">Prepared for {preparedFor.trim()}</div>}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-5">Net profit forecast</h1>
          <p className="text-sm text-gray-500 mt-1">Deal remuneration net of referral costs and operating overheads · Forecast period {period}</p>
        </div>

        {/* Headline figures */}
        <div className="px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 fc-page-break">
          <Figure label="Net revenue pipeline" value={fmtMoney(summary.net)} />
          <Figure label={`Operating costs (${pf.monthsCount} mo)`} value={`−${fmtMoney(pf.totalCost)}`} />
          <Figure label="Forecast net profit" value={fmtMoney(pf.netProfit)} accent negative={pf.netProfit < 0} />
          <Figure label="Banked to date" value={fmtMoney(summary.banked)} good />
        </div>

        {/* Monthly profit */}
        <div className="px-8 pb-6 fc-page-break">
          <SectionTitle>Net profit by month</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Period</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Net revenue</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Operating cost</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Net profit</th>
                  <th className="text-right font-semibold py-2 border-b-2 pr-1" style={{ borderColor: TEAL }}>Cumulative</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {pf.months.map((m) => (
                  <tr key={m.month} className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">{fmtMonth(m.month)}{m.paidRevenue > 0 && <span className="ml-2 text-[10px] font-semibold text-green-600 uppercase">banked</span>}</td>
                    <td className="py-2 text-right text-gray-700">{m.revenue > 0 ? fmtMoney(m.revenue) : "—"}</td>
                    <td className="py-2 text-right text-gray-400">{m.cost > 0 ? `−${fmtMoney(m.cost)}` : "—"}</td>
                    <td className={`py-2 text-right font-semibold ${m.profit < 0 ? "text-rose-600" : "text-gray-900"}`}>{fmtMoney(m.profit)}</td>
                    <td className={`py-2 text-right pr-1 ${m.cumulativeProfit < 0 ? "text-rose-500" : "text-gray-600"}`}>{fmtMoney(m.cumulativeProfit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-gray-900 border-t-2" style={{ borderColor: TEAL }}>
                  <td className="py-2.5">Total</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtMoney(pf.totalRevenue)}</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-500">−{fmtMoney(pf.totalCost)}</td>
                  <td className="py-2.5 text-right tabular-nums" style={{ color: pf.netProfit < 0 ? "#e11d48" : TEAL }}>{fmtMoney(pf.netProfit)}</td>
                  <td className="py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Operating cost breakdown */}
        {costs.length > 0 && (
          <div className="px-8 pb-6 fc-page-break">
            <SectionTitle>Monthly operating costs</SectionTitle>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <tbody className="tabular-nums">
                  {costs.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100">
                      <td className="py-2 text-gray-700">{c.label}</td>
                      <td className="py-2 text-right text-gray-700">{fmtMoney(c.monthly_amount)}/mo</td>
                    </tr>
                  ))}
                  <tr className="font-bold text-gray-900 border-t-2" style={{ borderColor: TEAL }}>
                    <td className="py-2">Total monthly overhead</td>
                    <td className="py-2 text-right">{fmtMoney(monthlyCost)}/mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Deal schedule */}
        <div className="px-8 pb-6 fc-page-break">
          <SectionTitle>Deals underlying the forecast</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left font-semibold py-2 border-b border-gray-300">Lot / address</th>
                  <th className="text-left font-semibold py-2 border-b border-gray-300">Purchaser</th>
                  <th className="text-right font-semibold py-2 border-b border-gray-300">Remuneration</th>
                  <th className="text-right font-semibold py-2 border-b border-gray-300">Referral</th>
                  <th className="text-right font-semibold py-2 border-b border-gray-300">Net</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {active.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-800">{d.lot}</td>
                    <td className="py-2 text-gray-600">{d.purchaser || "—"}</td>
                    <td className="py-2 text-right text-gray-700">{fmtMoney(d.remuneration)}</td>
                    <td className="py-2 text-right text-gray-400">{d.referrer_fee > 0 ? `−${fmtMoney(d.referrer_fee)}` : "—"}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{fmtMoney(dealNet(d))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Notes */}
        <div className="px-8 py-5 bg-gray-50 text-[11px] leading-relaxed text-gray-500 fc-page-break">
          <p className="font-semibold text-gray-600 mb-1">Basis &amp; assumptions</p>
          <p>
            Net revenue reflects remuneration on contracted and expected property deals, net of referral fees, apportioned to the month each
            instalment is scheduled. A flat monthly operating cost is applied across every month of the forecast window to derive net profit;
            actual overheads may vary. Amounts are in AUD and exclusive of GST. Payments marked &ldquo;banked&rdquo; have been received; all
            other amounts are forecast and subject to settlement and timing. Items shown as &ldquo;unscheduled&rdquo; are expected but not yet
            dated and carry no operating-cost month. Prepared for information purposes only and does not constitute financial advice.
          </p>
          <p className="mt-3 text-gray-400">NextKey Property Strategists · Generated {generatedAt}</p>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, accent, good, negative }: { label: string; value: string; accent?: boolean; good?: boolean; negative?: boolean }) {
  const bg = accent ? (negative ? "#7f1d1d" : TEAL) : undefined;
  return (
    <div className="rounded-xl border p-4" style={accent ? { backgroundColor: bg, borderColor: bg } : { borderColor: "#e5e7eb" }}>
      <div className={`text-[10px] uppercase tracking-widest ${accent ? "text-white/70" : "text-gray-400"}`}>{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${accent ? "text-white" : good ? "text-green-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{children}</h2>;
}
