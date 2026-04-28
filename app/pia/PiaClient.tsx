"use client";

import { useMemo, useState } from "react";
import { runPia, DEFAULT_INPUTS, type PiaInputs, type YearRow } from "./_calc";

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);

const fmtPct = (n: number, dp = 2) => (isFinite(n) ? `${n.toFixed(dp)}%` : "—");

export default function PiaClient() {
  const [inputs, setInputs] = useState<PiaInputs>(DEFAULT_INPUTS);
  const result = useMemo(() => runPia(inputs), [inputs]);
  const [activeTab, setActiveTab] = useState<"summary" | "schedule" | "chart">("summary");

  const update = <K extends keyof PiaInputs>(key: K, val: PiaInputs[K]) =>
    setInputs((s) => ({ ...s, [key]: val }));

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* ──────── INPUTS COLUMN ──────── */}
      <div className="col-span-12 lg:col-span-4 space-y-4">
        <Section title="Property">
          <Money label="Purchase price" value={inputs.purchasePrice} onChange={(v) => update("purchasePrice", v)} step={10000} />
          <Money label="Weekly rent" value={inputs.weeklyRent} onChange={(v) => update("weeklyRent", v)} step={5} />
          <Pct label="Rental growth p.a." value={inputs.rentalGrowth} onChange={(v) => update("rentalGrowth", v)} max={10} step={0.25} />
          <Pct label="Capital growth p.a." value={inputs.capitalGrowth} onChange={(v) => update("capitalGrowth", v)} max={12} step={0.25} />
          <Num label="Vacancy weeks/year" value={inputs.vacancyWeeks} onChange={(v) => update("vacancyWeeks", v)} min={0} max={52} step={1} />
        </Section>

        <Section title="Operating costs (year 1)">
          <Money label="Council rates" value={inputs.rates} onChange={(v) => update("rates", v)} step={100} />
          <Money label="Landlord insurance" value={inputs.insurance} onChange={(v) => update("insurance", v)} step={50} />
          <Money label="Body corp / strata" value={inputs.bodyCorporate} onChange={(v) => update("bodyCorporate", v)} step={100} />
          <Pct label="Property mgmt % of rent" value={inputs.managementPct} onChange={(v) => update("managementPct", v)} max={15} step={0.25} />
          <Pct label="Maintenance % of rent" value={inputs.maintenancePct} onChange={(v) => update("maintenancePct", v)} max={5} step={0.25} />
          <Pct label="Cost inflation p.a." value={inputs.propertyExpenseGrowth} onChange={(v) => update("propertyExpenseGrowth", v)} max={8} step={0.25} />
        </Section>

        <Section title="Acquisition costs">
          <Money label="Stamp duty" value={inputs.stampDuty} onChange={(v) => update("stampDuty", v)} step={500} />
          <Money label="Legal / conveyancing" value={inputs.legalFees} onChange={(v) => update("legalFees", v)} step={100} />
          <Money label="Building inspection" value={inputs.buildingInspection} onChange={(v) => update("buildingInspection", v)} step={50} />
          <Money label="Lender / setup fees" value={inputs.lenderFees} onChange={(v) => update("lenderFees", v)} step={100} />
          <Money label="Other (QS report, etc)" value={inputs.otherAcquisition} onChange={(v) => update("otherAcquisition", v)} step={100} />
        </Section>

        <Section title="Finance">
          <Money label="Loan amount" value={inputs.loanAmount} onChange={(v) => update("loanAmount", v)} step={10000} />
          <Pct label="Interest rate" value={inputs.interestRate} onChange={(v) => update("interestRate", v)} max={10} step={0.05} />
          <Num label="Loan term (years)" value={inputs.loanTermYears} onChange={(v) => update("loanTermYears", v)} min={5} max={30} step={1} />
          <Num label="Interest-only years" value={inputs.ioYears} onChange={(v) => update("ioYears", v)} min={0} max={10} step={1} />
          <p className="text-[11px] text-gray-500 mt-1">
            LVR: <strong>{((inputs.loanAmount / inputs.purchasePrice) * 100).toFixed(1)}%</strong> ·
            Deposit: <strong>{fmtCurrency(inputs.purchasePrice - inputs.loanAmount)}</strong>
          </p>
        </Section>

        <Section title="Tax & depreciation">
          <Pct label="Marginal tax rate (incl. medicare)" value={inputs.marginalTaxRate} onChange={(v) => update("marginalTaxRate", v)} max={47} step={0.5} />
          <Money label="Capital works (Div 43)" value={inputs.capitalWorksAnnual} onChange={(v) => update("capitalWorksAnnual", v)} step={500} />
          <Money label="Plant & equip (Div 40, year 1)" value={inputs.plantEquipmentAnnual} onChange={(v) => update("plantEquipmentAnnual", v)} step={500} />
          <Pct label="Plant & equip decline rate" value={inputs.plantEquipmentDeclineRate} onChange={(v) => update("plantEquipmentDeclineRate", v)} max={50} step={1} />
        </Section>

        <Section title="Horizon">
          <Num label="Holding period (years)" value={inputs.holdingYears} onChange={(v) => update("holdingYears", v)} min={1} max={30} step={1} />
        </Section>
      </div>

      {/* ──────── OUTPUT COLUMN ──────── */}
      <div className="col-span-12 lg:col-span-8 space-y-4">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Gross yield (yr 1)" value={fmtPct(result.grossYield)} />
          <Kpi label="Net yield (yr 1)" value={fmtPct(result.netYield)} />
          <Kpi label="Cash needed at start" value={fmtCurrency(result.initialCashRequired)} highlight />
          <Kpi label="Breakeven cashflow" value={result.breakevenYear ? `Year ${result.breakevenYear}` : "Never (in horizon)"} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label={`Property value (yr ${inputs.holdingYears})`} value={fmtCurrency(result.endValue)} />
          <Kpi label="Loan balance at end" value={fmtCurrency(result.endLoanBalance)} />
          <Kpi label="Equity at end" value={fmtCurrency(result.endEquity)} highlight />
          <Kpi label="CGT payable on sale" value={fmtCurrency(result.cgtPayable)} className="text-red-700" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi
            label="Net cash over holding"
            value={fmtCurrency(result.netCashOverHolding)}
            className={result.netCashOverHolding >= 0 ? "text-green-700" : "text-red-700"}
          />
          <Kpi label="Total return (after CGT)" value={fmtCurrency(result.totalReturn)} highlight />
          <Kpi label="IRR (approx)" value={fmtPct(result.irrApprox, 2)} />
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 flex gap-4">
          {(["summary", "schedule", "chart"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`pb-2 px-1 text-sm capitalize border-b-2 ${
                activeTab === t ? "border-gray-900 font-semibold" : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "summary" ? "Plain-English summary" : t === "schedule" ? "Annual schedule" : "Equity chart"}
            </button>
          ))}
        </div>

        {activeTab === "summary" && <PlainEnglish inputs={inputs} result={result} />}
        {activeTab === "schedule" && <ScheduleTable rows={result.schedule} />}
        {activeTab === "chart" && <EquityChart rows={result.schedule} purchase={inputs.purchasePrice} />}

        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
          <em>
            Advisor-grade modelling for client discussions. Not a substitute for a quantity-surveyor depreciation report,
            licensed mortgage broker serviceability analysis, accountant tax advice, or solicitor settlement-cost
            review. NextKey is not a licensed financial planner, mortgage broker, real estate agent or solicitor.
            Property investment carries risk including loss of capital. Past returns are not indicative of future performance.
          </em>
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Money({
  label, value, onChange, step = 100,
}: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <FieldShell label={label}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
        <input
          type="number"
          value={value}
          step={step}
          min={0}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full pl-7 pr-3 py-1.5 border border-gray-300 rounded-md text-sm"
        />
      </div>
    </FieldShell>
  );
}

function Pct({
  label, value, onChange, min = 0, max = 100, step = 0.1,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <FieldShell label={`${label} — ${value.toFixed(2)}%`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </FieldShell>
  );
}

function Num({
  label, value, onChange, min = 0, max = 100, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
      />
    </FieldShell>
  );
}

function Kpi({
  label, value, highlight = false, className = "",
}: { label: string; value: string; highlight?: boolean; className?: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-3 ${highlight ? "ring-1 ring-gray-900" : ""}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 ${className}`}>{value}</p>
    </div>
  );
}

// ─── Schedule table ───────────────────────────────────────────────────────

function ScheduleTable({ rows }: { rows: YearRow[] }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left py-2 px-3 text-gray-500 font-medium">Yr</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Eff. rent</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Operating</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Interest</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Principal</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Depreciation</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Tax effect</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">CF before tax</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">CF after tax</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Property value</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Loan balance</th>
            <th className="text-right py-2 px-3 text-gray-500 font-medium">Equity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="py-1.5 px-3 font-medium">{r.year}</td>
              <td className="py-1.5 px-3 text-right font-mono">{fmtCurrency(r.effectiveRent)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtCurrency(r.propertyExpenses)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtCurrency(r.interestPaid)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtCurrency(r.principalPaid)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtCurrency(r.capitalWorks + r.plantEquipment)}</td>
              <td className={`py-1.5 px-3 text-right font-mono ${r.taxEffect < 0 ? "text-green-700" : "text-red-700"}`}>
                {r.taxEffect < 0 ? "+" : "-"}{fmtCurrency(Math.abs(r.taxEffect))}
              </td>
              <td className={`py-1.5 px-3 text-right font-mono ${r.cashFlowBeforeTax >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmtCurrency(r.cashFlowBeforeTax)}
              </td>
              <td className={`py-1.5 px-3 text-right font-mono font-semibold ${r.cashFlowAfterTax >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fmtCurrency(r.cashFlowAfterTax)}
              </td>
              <td className="py-1.5 px-3 text-right font-mono">{fmtCurrency(r.propertyValue)}</td>
              <td className="py-1.5 px-3 text-right font-mono text-gray-500">{fmtCurrency(r.loanBalance)}</td>
              <td className="py-1.5 px-3 text-right font-mono font-semibold">{fmtCurrency(r.equity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Equity chart (pure-CSS bars, no chart library) ───────────────────────

function EquityChart({ rows, purchase }: { rows: YearRow[]; purchase: number }) {
  if (rows.length === 0) return null;
  const maxValue = Math.max(...rows.map((r) => r.propertyValue));
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold">Property value &amp; equity progression</h3>
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-500"></span> Property value
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-500"></span> Equity
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-gray-200"></span> Loan
          </span>
        </div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const valuePct = (r.propertyValue / maxValue) * 100;
          const equityPct = (r.equity / r.propertyValue) * 100;
          return (
            <div key={r.year} className="flex items-center gap-2 text-xs">
              <div className="w-8 text-right text-gray-500 font-medium">Yr {r.year}</div>
              <div className="flex-1 relative h-6 bg-gray-100 rounded-sm overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-blue-100"
                  style={{ width: `${valuePct}%` }}
                />
                <div
                  className="absolute inset-y-0 left-0 bg-emerald-500"
                  style={{ width: `${(equityPct / 100) * valuePct}%` }}
                />
                <span className="absolute inset-y-0 left-2 flex items-center text-[10px] font-mono text-gray-700">
                  {fmtCurrency(r.equity)}
                </span>
              </div>
              <div className="w-24 text-right font-mono text-gray-700">{fmtCurrency(r.propertyValue)}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">
        Starting position: equity of <strong>{fmtCurrency(purchase - rows[0].loanBalance + rows[0].principalPaid)}</strong> after year 1
        (deposit + first-year principal). Equity grows from price appreciation + amortisation against the loan.
      </p>
    </div>
  );
}

// ─── Plain-English summary ────────────────────────────────────────────────

function PlainEnglish({ inputs, result }: { inputs: PiaInputs; result: ReturnType<typeof runPia> }) {
  const lvr = (inputs.loanAmount / inputs.purchasePrice) * 100;
  const isCashflowNegative = result.netCashOverHolding < 0;
  const breakeven = result.breakevenYear;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 text-sm leading-relaxed">
      <div>
        <h3 className="font-semibold text-base mb-2">The deal at a glance</h3>
        <p className="text-gray-700">
          A <strong>{fmtCurrency(inputs.purchasePrice)}</strong> property at{" "}
          <strong>${inputs.weeklyRent}/week</strong> rent ({fmtPct(result.grossYield)} gross yield, {fmtPct(result.netYield)} net of operating).
          You're financing <strong>{fmtCurrency(inputs.loanAmount)}</strong> at <strong>{lvr.toFixed(1)}% LVR</strong>{" "}
          on a <strong>{inputs.interestRate}%</strong> loan
          {inputs.ioYears > 0 ? <> with <strong>{inputs.ioYears} years interest-only</strong> before principal repayments kick in</> : <> on full P&I from day one</>}.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-2">Initial cash required</h3>
        <p className="text-gray-700">
          You'll need <strong>{fmtCurrency(result.initialCashRequired)}</strong> at settlement —{" "}
          {fmtCurrency(inputs.purchasePrice - inputs.loanAmount)} deposit plus {fmtCurrency(result.totalAcquisitionCost)} of acquisition costs
          (stamp duty, legal, inspection, lender setup).
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-2">Cashflow profile over {inputs.holdingYears} years</h3>
        {isCashflowNegative ? (
          <p className="text-gray-700">
            This is a <span className="text-red-700 font-semibold">negatively-geared</span> position over the holding period
            — you'll be putting <strong>{fmtCurrency(Math.abs(result.netCashOverHolding))}</strong> into the property in net terms
            (after rent, expenses, loan, depreciation tax shield).
            {breakeven ? <> Cashflow turns positive in <strong>year {breakeven}</strong>.</> : <> It stays negative across the entire holding period at current assumptions.</>}{" "}
            The case for negative gearing rests on capital growth offsetting holding costs — see the equity progression below.
          </p>
        ) : (
          <p className="text-gray-700">
            This is a <span className="text-green-700 font-semibold">cashflow-positive</span> position{" "}
            {breakeven && breakeven > 1 ? <>from year {breakeven} onward</> : <>from day one</>} — net{" "}
            <strong>{fmtCurrency(result.netCashOverHolding)}</strong> of after-tax cash over the holding period after rent,
            expenses, loan, and depreciation tax shield.
          </p>
        )}
      </div>

      <div>
        <h3 className="font-semibold text-base mb-2">Where the wealth comes from</h3>
        <p className="text-gray-700">
          At a {inputs.capitalGrowth}% growth assumption, the property is worth{" "}
          <strong>{fmtCurrency(result.endValue)}</strong> after {inputs.holdingYears} years
          (vs. <strong>{fmtCurrency(inputs.purchasePrice)}</strong> at purchase). Your loan balance falls to{" "}
          <strong>{fmtCurrency(result.endLoanBalance)}</strong>, so your equity reaches{" "}
          <strong className="text-green-700">{fmtCurrency(result.endEquity)}</strong>.
        </p>
        <p className="text-gray-700 mt-2">
          If you sold at year {inputs.holdingYears}, the capital gain of <strong>{fmtCurrency(result.capitalGain)}</strong>{" "}
          would attract approximately <strong className="text-red-700">{fmtCurrency(result.cgtPayable)}</strong> in CGT
          (50% individual discount applied at your {inputs.marginalTaxRate}% marginal rate).
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-2">Total return</h3>
        <p className="text-gray-700">
          After-tax holding cashflow + ending equity − initial cash − CGT on sale ≈{" "}
          <strong className="text-gray-900">{fmtCurrency(result.totalReturn)}</strong>{" "}
          on initial cash of {fmtCurrency(result.initialCashRequired)}. That's an approximate compounded return of{" "}
          <strong>{fmtPct(result.irrApprox)}</strong> per year over {inputs.holdingYears} years.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900 text-xs">
        <strong>What this model does NOT include:</strong> land tax (state-specific, kicks in above land-value thresholds),
        mortgage insurance if LVR &gt; 80%, capital improvements during holding, refinancing costs, multiple-property
        portfolio interactions, principal-and-interest repayment changes after IO period, or any tenant-specific risks
        (extended vacancy, damage, defaulted rent).
      </div>
    </div>
  );
}
