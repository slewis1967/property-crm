import { supabase } from "../../../../utils/supabase";
import { notFound, redirect } from "next/navigation";
import PrintButton from "./PrintButton";

/**
 * Client-facing PIA report — first-pass Apple-speak template.
 *
 * Renders a pia_report produced by /api/deal-analyser/generate: the conservative
 * projection, the SOURCED market context (past-performance, disclaimed), the
 * flyer images, and the mandatory general-advice footer. Print → Save as PDF.
 *
 * Compliance is structural here: the projection and the historical figures live
 * in separate sections, growth is labelled an assumption, and nothing implies a
 * guaranteed return. Run client copy through compliance-check before sending.
 */

const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const PCT = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

export default async function DealReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: report } = await supabase.from("pia_reports").select("*").eq("id", id).maybeSingle();
  if (!report) return notFound();

  const r = (report.results ?? {}) as any;
  // A comparison report lives on its own route — send it there.
  if (r.kind === "comparison") redirect(`/deal-analyser/compare/${id}`);
  const inputs = (report.inputs ?? {}) as any;
  const specs = r.propertySpecs ?? {};
  const mc = r.marketContext ?? {};
  const growth = mc.historical_capital_growth_12m_pct ?? null;
  const sched = (r.schedule ?? []) as any[];
  const yr = (n: number) => sched.find((x) => x.year === n);
  const final = sched[sched.length - 1];
  const y1 = yr(1);
  const lvr = inputs.purchasePrice ? Math.round((inputs.loanAmount / inputs.purchasePrice) * 100) : 0;

  // Sign the flyer images (private bucket).
  let imageUrls: string[] = [];
  const paths: string[] = specs.image_paths ?? [];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("mail-attachments").createSignedUrls(paths, 3600);
    imageUrls = (signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
  }

  const addr = r.address ?? r.suburb ?? "Investment property";
  const headline = specs.is_co_living
    ? `A ${specs.bedrooms ?? ""}-bedroom co-living home, built to work harder.`
    : `A ${specs.bedrooms ?? ""}-bedroom home in ${r.suburb ?? "a growth corridor"}.`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar — not printed */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <span className="text-sm text-gray-500">{report.title}</span>
        <PrintButton />
      </div>

      <article className="max-w-3xl mx-auto bg-white my-6 print:my-0 shadow-sm print:shadow-none">
        {/* Hero */}
        <header className="px-10 pt-12 pb-10 border-b border-gray-100" style={{ background: "#0F4C5C" }}>
          <p className="text-[#FFB627] text-sm font-semibold tracking-wide uppercase">NextKey · Investment Analysis</p>
          <h1 className="text-white text-3xl font-bold mt-3 leading-tight">{headline}</h1>
          <p className="text-white/70 mt-2">{addr}{specs.estate ? ` · ${specs.estate}` : ""}</p>
          <div className="mt-8 grid grid-cols-3 gap-6">
            <Stat label="Package price" value={AUD(specs.total_price ?? inputs.purchasePrice)} />
            <Stat label="Gross yield" value={PCT(r.grossYield)} />
            <Stat label="Weekly rent" value={AUD(inputs.weeklyRent) + (specs.is_co_living ? " (all rooms)" : "")} />
          </div>
        </header>

        {/* The home */}
        <Section title="The home">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <Spec label="Bedrooms" value={specs.bedrooms} />
            <Spec label="Bathrooms" value={specs.bathrooms} />
            <Spec label="Car" value={specs.car_spaces} />
            <Spec label="Living" value={specs.living_areas} />
            <Spec label="Land" value={specs.land_size_m2 ? `${specs.land_size_m2} m²` : null} />
            <Spec label="House" value={specs.house_size_m2 ? `${specs.house_size_m2} m²` : null} />
            <Spec label="Design" value={specs.house_design} />
            <Spec label="Land + build" value={specs.land_price && specs.build_price ? `${AUD(specs.land_price)} + ${AUD(specs.build_price)}` : null} />
          </div>
          {(specs.key_inclusions ?? []).length > 0 && (
            <>
              <p className="text-sm font-semibold text-gray-700 mb-2">Included</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                {specs.key_inclusions.map((inc: string, i: number) => (
                  <li key={i} className="flex gap-2"><span className="text-[#0F4C5C]">✓</span>{inc}</li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* Gallery */}
        {imageUrls.length > 0 && (
          <Section title="Floorplan & design">
            <div className="grid grid-cols-1 gap-4">
              {imageUrls.map((u, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={u} alt={`Plan ${i + 1}`} className="w-full rounded-lg border border-gray-100" />
              ))}
            </div>
          </Section>
        )}

        {/* The opportunity — sourced, past-performance, disclaimed */}
        <Section title="The opportunity">
          <p className="text-sm text-gray-500 mb-4">
            Recent market data for {r.suburb ?? "the area"}. These are historical, sourced figures —
            past performance, not a forecast.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Spec label="Median price" value={mc.median_house_price?.reconciled ? AUD(mc.median_house_price.reconciled) : null} />
            <Spec label="12-mo growth" value={growth?.reconciled != null ? `${growth.reconciled}%` : null} />
            <Spec label="Median rent" value={mc.median_rent_pw ? `${AUD(mc.median_rent_pw)}/wk` : null} />
            <Spec label="Vacancy" value={mc.vacancy_rate_pct != null ? `${mc.vacancy_rate_pct}%` : null} />
          </div>
          {growth?.sources?.length > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Growth sources: {growth.sources.map((s: any) => `${s.source} ${s.value}%`).join(" · ")}
              {growth.variance_flag ? " (sources vary — range shown for transparency)" : ""}
            </p>
          )}
        </Section>

        {/* The numbers — projection on conservative assumptions */}
        <Section title="The numbers">
          {r.rentBasis?.per_room && (
            <div className="rounded-lg p-5 mb-5" style={{ background: "#0F4C5C0d", border: "1px solid #0F4C5C33" }}>
              <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: "#0F4C5C" }}>Co-living income</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {r.rentBasis.rooms} rooms × {AUD(r.rentBasis.room_rent)}/wk = {AUD(r.rentBasis.weekly_rent)}/wk
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {PCT(r.grossYield)} gross yield — multiple income streams from one home, well above a single-tenancy let.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <Spec label="Gross yield" value={PCT(r.grossYield)} />
            <Spec label="Net yield (yr 1)" value={PCT(r.netYield)} />
            <Spec label="Acquisition cost" value={AUD(r.totalAcquisitionCost)} />
            <Spec label="Cashflow-positive" value={r.breakevenYear ? `Year ${r.breakevenYear}` : "Beyond term"} />
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 text-xs text-amber-900">
            <strong>Assumptions, not forecasts.</strong> Projection uses a conservative{" "}
            <strong>{PCT(inputs.capitalGrowth)}</strong> p.a. capital growth and{" "}
            <strong>{PCT(inputs.rentalGrowth)}</strong> p.a. rental growth — deliberately independent of the
            higher recent figures above. Actual returns will differ.
          </div>
        </Section>

        {/* Funding & cashflow */}
        <Section title="Funding & cashflow">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <Spec label="Loan / LVR" value={`${AUD(inputs.loanAmount)} · ${lvr}%`} />
            <Spec label="Deposit" value={AUD(inputs.purchasePrice - inputs.loanAmount)} />
            <Spec label="Cash to purchase" value={AUD(r.initialCashRequired)} />
            <Spec label="Interest rate" value={PCT(inputs.interestRate)} />
          </div>
          <p className="text-sm font-semibold text-gray-700 mb-2">After-tax cashflow</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1, 5, 10].filter((y) => y <= inputs.holdingYears).map((y) => {
              const row = yr(y);
              return <Spec key={y} label={`Year ${y}`} value={row ? `${AUD(row.cashFlowAfterTax)}/yr` : "—"} />;
            })}
            <Spec label={`Year ${inputs.holdingYears}`} value={final ? `${AUD(final.cashFlowAfterTax)}/yr` : "—"} />
          </div>
          {y1 && y1.taxEffect < 0 && (
            <p className="text-xs text-gray-500 mt-3">
              Year-1 negative gearing reduces taxable income by {AUD(-y1.taxableIncome)} — an estimated tax saving of about{" "}
              {AUD(-y1.taxEffect)} at a {PCT(inputs.marginalTaxRate)} marginal rate.
            </p>
          )}
        </Section>

        {/* Projected position at end of hold */}
        <Section title={`Projected position — year ${inputs.holdingYears}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Spec label="Property value" value={AUD(r.endValue)} />
            <Spec label="Loan balance" value={AUD(r.endLoanBalance)} />
            <Spec label="Equity" value={AUD(r.endEquity)} />
            <Spec label="Growth assumed" value={`${PCT(inputs.capitalGrowth)} p.a.`} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
            <Spec label="Net cash over hold" value={AUD(r.netCashOverHolding)} />
            <Spec label="Capital gain (gross)" value={AUD(r.capitalGain)} />
            <Spec label="Est. CGT" value={AUD(r.cgtPayable)} />
            <Spec label="Indicative total return" value={AUD(r.totalReturn)} />
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Indicative total return = net cashflow + equity gain − estimated CGT, on {PCT(inputs.capitalGrowth)} p.a. growth
            held {inputs.holdingYears} years. An estimate on the stated assumptions, not a forecast or guarantee.
          </p>
        </Section>

        {/* Assumptions + sourced costs */}
        <Section title="Assumptions">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Spec label="Interest rate" value={PCT(inputs.interestRate)} />
            <Spec label="Stamp duty" value={AUD(inputs.stampDuty)} />
            <Spec label="Council rates" value={`${AUD(inputs.rates)}/yr`} />
            <Spec label="Insurance" value={`${AUD(inputs.insurance)}/yr`} />
            <Spec label="Management" value={PCT(inputs.managementPct)} />
            <Spec label="Marginal tax" value={PCT(inputs.marginalTaxRate)} />
            <Spec label="Vacancy" value={`${inputs.vacancyWeeks} wk/yr`} />
            <Spec label="Holding period" value={`${inputs.holdingYears} yr`} />
          </div>
          {(r.assumptionSources?.length ?? 0) > 0 && (
            <p className="text-xs text-gray-400 mt-3">
              Sourced figures: {r.assumptionSources.map((s: any) => `${s.label} — ${s.source} (${s.date})`).join(" · ")}.
              Costs are current estimates and will vary by lender, insurer and council.
            </p>
          )}
        </Section>

        {/* Operator's additional information / changes (free text from the hub) */}
        {r.operatorNotes && (
          <Section title="Additional information">
            <p className="text-sm text-gray-700 whitespace-pre-line">{r.operatorNotes}</p>
          </Section>
        )}

        {/* Disclaimer */}
        <footer className="px-10 py-8 border-t border-gray-100 text-[11px] leading-relaxed text-gray-400">
          <p className="font-semibold text-gray-500 mb-1">General advice only</p>
          <p>
            This report is general information about a property and its market, prepared by NextKey Property
            Strategists. It does not consider your personal objectives, financial situation or needs, and is not
            financial product, credit, legal or taxation advice. NextKey is not a licensed financial planner,
            mortgage broker, tax agent, real estate agent or solicitor. Property investment carries risk including
            loss of capital. Market figures are sourced and dated where shown; past performance is not indicative
            of future results. Projection figures are estimates based on stated assumptions, not guarantees. Seek
            your own independent financial, legal and taxation advice before making any decision.
          </p>
        </footer>
      </article>

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } @page { margin: 12mm; } }`}</style>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-white/60 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-white text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-10 py-8 border-b border-gray-100 print:break-inside-avoid">
      <h2 className="text-xl font-bold text-gray-900 mb-5">{title}</h2>
      {children}
    </section>
  );
}

function Spec({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}
