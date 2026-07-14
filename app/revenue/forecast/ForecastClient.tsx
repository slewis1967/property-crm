"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  fmtMoney,
  fmtMonth,
  forecastByMonth,
  summarise,
  type RevenueDeal,
  dealNet,
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

export default function ForecastClient() {
  const [deals, setDeals] = useState<RevenueDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState("");
  const [preparedFor, setPreparedFor] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/revenue", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) setDeals(json.deals ?? []);
      } catch { /* empty */ }
      if (!cancelled) {
        setLoading(false);
        setGeneratedAt(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const active = deals.filter((d) => d.stage !== "lost");
  const summary = summarise(deals);
  const months = forecastByMonth(deals);
  const scheduled = months.filter((m) => m.month !== "unscheduled");
  const forecastRemaining = summary.net - summary.banked;
  const period =
    scheduled.length > 0 ? `${fmtMonth(scheduled[0].month)} – ${fmtMonth(scheduled[scheduled.length - 1].month)}` : "—";
  const maxNet = Math.max(1, ...months.map((m) => Math.abs(m.net)));

  if (loading) {
    return <div className="max-w-4xl mx-auto text-sm text-gray-400 py-10">Preparing forecast…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      {/* Toolbar */}
      <div className="no-print flex items-center justify-between gap-4 mb-5 flex-wrap">
        <Link href="/revenue" className="text-sm text-gray-500 hover:text-gray-800">← Back to Revenue</Link>
        <div className="flex items-center gap-2">
          <input
            value={preparedFor}
            onChange={(e) => setPreparedFor(e.target.value)}
            placeholder="Prepared for… (optional)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm w-56"
          />
          <button onClick={() => window.print()} className="rounded-lg text-white font-semibold px-4 py-2 text-sm" style={{ backgroundColor: TEAL }}>
            🖨 Print / Save as PDF
          </button>
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
              <div className="text-[11px] uppercase tracking-widest text-gray-400">Cash Flow Forecast</div>
              <div className="text-sm text-gray-700 mt-0.5">Generated {generatedAt}</div>
              {preparedFor.trim() && <div className="text-sm text-gray-700">Prepared for {preparedFor.trim()}</div>}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-5">Commission cash flow forecast</h1>
          <p className="text-sm text-gray-500 mt-1">Contracted &amp; expected deal remuneration, net of referral costs · Forecast period {period}</p>
        </div>

        {/* Headline figures */}
        <div className="px-8 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 fc-page-break">
          <Figure label="Net revenue pipeline" value={fmtMoney(summary.net)} accent />
          <Figure label="Banked to date" value={fmtMoney(summary.banked)} good />
          <Figure label="Forecast to come" value={fmtMoney(forecastRemaining)} />
          <Figure label="Deals" value={String(summary.count)} />
        </div>

        {/* Monthly cashflow */}
        <div className="px-8 pb-6 fc-page-break">
          <SectionTitle>Net cash by month</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="text-left font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Period</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Cash in</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Referral cost</th>
                  <th className="text-right font-semibold py-2 border-b-2" style={{ borderColor: TEAL }}>Net</th>
                  <th className="text-right font-semibold py-2 border-b-2 pr-1" style={{ borderColor: TEAL }}>Cumulative net</th>
                  <th className="py-2 border-b-2 w-28" style={{ borderColor: TEAL }}></th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {months.map((m) => (
                  <tr key={m.month} className="border-b border-gray-100">
                    <td className="py-2 text-gray-700">{fmtMonth(m.month)}{m.paid > 0 && <span className="ml-2 text-[10px] font-semibold text-green-600 uppercase">banked</span>}</td>
                    <td className="py-2 text-right text-gray-700">{fmtMoney(m.gross)}</td>
                    <td className="py-2 text-right text-gray-400">{m.referral > 0 ? `−${fmtMoney(m.referral)}` : "—"}</td>
                    <td className="py-2 text-right font-semibold text-gray-900">{fmtMoney(m.net)}</td>
                    <td className="py-2 text-right text-gray-600 pr-1">{fmtMoney(m.cumulativeNet)}</td>
                    <td className="py-2 pl-2">
                      <div className="h-2 rounded-sm" style={{ width: `${Math.max(4, (Math.abs(m.net) / maxNet) * 100)}%`, backgroundColor: m.month === "unscheduled" ? "#cbd5e1" : TEAL }} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-gray-900 border-t-2" style={{ borderColor: TEAL }}>
                  <td className="py-2.5">Total</td>
                  <td className="py-2.5 text-right tabular-nums">{fmtMoney(summary.gross)}</td>
                  <td className="py-2.5 text-right tabular-nums text-gray-500">−{fmtMoney(summary.referrers)}</td>
                  <td className="py-2.5 text-right tabular-nums" style={{ color: TEAL }}>{fmtMoney(summary.net)}</td>
                  <td className="py-2.5"></td>
                  <td className="py-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

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
            Figures reflect remuneration on contracted and expected property deals, net of referral fees payable, apportioned to the
            month each instalment is scheduled. Amounts are in AUD and are exclusive of GST. This is a revenue cash-flow forecast; it does
            not include the company&apos;s operating overheads. Payments marked &ldquo;banked&rdquo; have been received; all other amounts are
            forecast and subject to settlement and timing. Items shown as &ldquo;unscheduled&rdquo; are expected but not yet dated.
            Prepared for information purposes only and does not constitute financial advice.
          </p>
          <p className="mt-3 text-gray-400">NextKey Property Strategists · Generated {generatedAt}</p>
        </div>
      </div>
    </div>
  );
}

function Figure({ label, value, accent, good }: { label: string; value: string; accent?: boolean; good?: boolean }) {
  return (
    <div className="rounded-xl border p-4" style={accent ? { backgroundColor: TEAL, borderColor: TEAL } : { borderColor: "#e5e7eb" }}>
      <div className={`text-[10px] uppercase tracking-widest ${accent ? "text-white/70" : "text-gray-400"}`}>{label}</div>
      <div className={`text-xl font-bold mt-1 tabular-nums ${accent ? "text-white" : good ? "text-green-600" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">{children}</h2>;
}
