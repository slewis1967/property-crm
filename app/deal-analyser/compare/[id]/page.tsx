import { supabase } from "../../../../utils/supabase";
import { notFound } from "next/navigation";
import PrintButton from "../../report/[id]/PrintButton";
import ReportActions from "../../ReportActions";
import type { DealComparison, ScoredProperty, ScoreFactor } from "../../../../utils/deal-comparison";

export const dynamic = "force-dynamic";

/**
 * Client-facing comparison report — the 1–10 investment-merit rating + best-pick
 * across every property in a deal packet. Renders a pia_report tagged
 * results.kind="comparison" (written by /api/deal-analyser/generate when ≥2
 * properties produced a PIA).
 *
 * Compliance is structural: each property's score is broken down into the exact
 * factual factors that earned it (yield, land, vacancy, price, income structure),
 * the rating is labelled NextKey's general assessment, and the general-advice
 * footer + "past performance" framing carry through. No guaranteed-return language.
 */

const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const PCT = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

export default async function ComparisonReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: report } = await supabase.from("pia_reports").select("*").eq("id", id).maybeSingle();
  if (!report) return notFound();

  const r = (report.results ?? {}) as { kind?: string; comparison?: DealComparison; deal_packet_id?: string | null };
  if (r.kind !== "comparison" || !r.comparison) return notFound();
  const cmp = r.comparison as DealComparison;
  const props = cmp.properties ?? [];
  const top = cmp.recommendation;
  const isPick = (p: ScoredProperty) =>
    !!top && p.suburb === top.suburb && p.address === top.address;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar — not printed */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">{report.title}</span>
        <div className="flex items-center gap-2">
          <ReportActions reportId={id} dealPacketId={r.deal_packet_id ?? null} />
          <PrintButton />
        </div>
      </div>

      <article className="max-w-4xl mx-auto bg-white my-6 print:my-0 shadow-sm print:shadow-none">
        {/* Hero */}
        <header className="px-10 pt-12 pb-10 border-b border-gray-100" style={{ background: "#0F4C5C" }}>
          <p className="text-[#FFB627] text-sm font-semibold tracking-wide uppercase">NextKey · Investment Comparison</p>
          <h1 className="text-white text-3xl font-bold mt-3 leading-tight">
            {props.length} homes, weighed on what matters.
          </h1>
          <p className="text-white/70 mt-2">
            Each property scored out of 10 on the levers that actually drive investor return — yield, income
            structure, land, rental demand and entry price.
          </p>
        </header>

        {/* Recommendation */}
        {top && (
          <section className="px-10 py-8 border-b border-gray-100 print:break-inside-avoid">
            <div className="rounded-xl p-6" style={{ background: "#FFB6270d", border: "1px solid #FFB62755" }}>
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: "#B07A00" }}>
                NextKey&apos;s pick
              </p>
              <div className="flex items-baseline gap-3 mt-1 flex-wrap">
                <h2 className="text-2xl font-bold text-gray-900">{top.address ?? top.suburb}</h2>
                <span className="text-lg font-bold" style={{ color: "#0F4C5C" }}>{top.score}/10</span>
              </div>
              {top.why.length > 0 && (
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-700">
                  {top.why.map((w, i) => (
                    <li key={i} className="flex gap-2"><span style={{ color: "#FFB627" }}>★</span>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}

        {/* Side-by-side scorecards */}
        <section className="px-10 py-8 border-b border-gray-100">
          <div className={`grid gap-6 ${props.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
            {props.map((p, i) => (
              <Scorecard key={i} p={p} pick={isPick(p)} />
            ))}
          </div>
        </section>

        {/* How we scored — transparency */}
        <section className="px-10 py-8 border-b border-gray-100 print:break-inside-avoid">
          <h2 className="text-xl font-bold text-gray-900 mb-3">How the rating is built</h2>
          <p className="text-sm text-gray-600">
            Each score is the sum of six factors out of 10, led by each property&apos;s own modelled PIA figures:
            projected return / IRR (max 3), net rental yield (2) and cashflow strength (1.5), then income structure
            (1), land / growth potential (1.5) and entry price (1). Nothing is weighted by opinion; every point traces
            to the figure shown for that property, and the modelled figures use conservative growth assumptions.
          </p>
        </section>

        {/* Disclaimer */}
        <footer className="px-10 py-8 text-[11px] leading-relaxed text-gray-400">
          {cmp.disclaimers?.length > 0 && (
            <ul className="mb-3 space-y-1">
              {cmp.disclaimers.map((d, i) => (
                <li key={i}>· {d}</li>
              ))}
            </ul>
          )}
          <p className="font-semibold text-gray-500 mb-1">General advice only</p>
          <p>
            This comparison is general information about properties and their markets, prepared by NextKey Property
            Strategists. It does not consider your personal objectives, financial situation or needs, and is not
            financial product, credit, legal or taxation advice. NextKey is not a licensed financial planner,
            mortgage broker, tax agent, real estate agent or solicitor. Property investment carries risk including
            loss of capital. Market figures are sourced and dated where shown; past performance is not indicative of
            future results. Ratings are estimates based on the stated factors, not guarantees. Seek your own
            independent financial, legal and taxation advice before making any decision.
          </p>
        </footer>
      </article>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } @page { margin: 12mm; } }`}</style>
    </div>
  );
}

function Scorecard({ p, pick }: { p: ScoredProperty; pick: boolean }) {
  return (
    <div
      className="rounded-xl p-5 print:break-inside-avoid"
      style={pick ? { border: "2px solid #FFB627", background: "#FFB6270a" } : { border: "1px solid #e5e7eb" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 leading-tight">{p.address ?? p.suburb ?? "Property"}</h3>
          {p.address && p.suburb && <p className="text-xs text-gray-500">{p.suburb}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-3xl font-bold leading-none" style={{ color: "#0F4C5C" }}>{p.score}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">/ 10</p>
        </div>
      </div>
      {pick && (
        <p className="text-[10px] font-bold uppercase tracking-wide mt-2" style={{ color: "#B07A00" }}>
          ★ NextKey&apos;s pick
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-sm">
        <Metric label="Package price" value={AUD(p.price)} />
        <Metric label="Projected return (IRR)" value={PCT(p.irr)} />
        <Metric label="Net yield" value={PCT(p.netYield)} />
        <Metric label="Total return" value={AUD(p.totalReturn)} />
        <Metric label="Cashflow-positive" value={p.breakevenYear ? `Year ${p.breakevenYear}` : "Beyond term"} />
        <Metric label="End equity" value={AUD(p.endEquity)} />
        <Metric label="Income" value={p.is_co_living ? `Co-living · ${p.rooms ?? "?"} rooms` : "Single tenancy"} />
        <Metric label="Land" value={p.land_size_m2 ? `${p.land_size_m2} m²` : "—"} />
      </div>

      <div className="mt-4 space-y-2">
        {p.factors.map((f, i) => (
          <FactorBar key={i} f={f} />
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function FactorBar({ f }: { f: ScoreFactor }) {
  const pct = f.max > 0 ? Math.round((f.points / f.max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{f.label}</span>
        <span className="text-gray-400">{f.detail}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#0F4C5C" }} />
      </div>
    </div>
  );
}
