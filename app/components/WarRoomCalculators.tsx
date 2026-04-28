"use client";

/**
 * WarRoomCalculators — six PIA-style quick calculators for the War Room.
 *
 * Designed for the advisor-during-a-30-min-call use case. All client-side,
 * no server roundtrip, instant updates as the user types. Numbers are
 * directionally right (advisor-grade) but explicitly NOT contract-grade —
 * stamp duty / borrowing / FHG eligibility rules change quarterly and per
 * lender. Disclaimers on each card.
 *
 * Future: a separate full PIA-equivalent page using AI to model multi-
 * property scenarios, depreciation schedules, and tax outcomes.
 */
import { useMemo, useState } from "react";

const fmt = (n: number, opts: Intl.NumberFormatOptions = {}) =>
  new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0, ...opts }).format(
    isFinite(n) ? n : 0,
  );
const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(isFinite(n) ? n : 0);
const fmtPct = (n: number, dp = 2) =>
  isFinite(n) ? `${n.toFixed(dp)}%` : "—";

// ─── Calculator 1: Rental Yield ────────────────────────────────────────────

function YieldCalculator() {
  const [price, setPrice] = useState(750000);
  const [weekly, setWeekly] = useState(620);
  const [costsPct, setCostsPct] = useState(25);

  const annualRent = weekly * 52;
  const annualCosts = annualRent * (costsPct / 100);
  const grossYield = (annualRent / price) * 100;
  const netYield = ((annualRent - annualCosts) / price) * 100;

  return (
    <Card title="Rental yield" emoji="🧮">
      <Field label="Purchase price">
        <NumberInput value={price} onChange={setPrice} prefix="$" step={10000} />
      </Field>
      <Field label="Weekly rent">
        <NumberInput value={weekly} onChange={setWeekly} prefix="$" step={5} />
      </Field>
      <Field label={`Annual costs (% of rent) — ${costsPct}%`}>
        <input
          type="range"
          min={10}
          max={50}
          step={1}
          value={costsPct}
          onChange={(e) => setCostsPct(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-gray-500 mt-1">
          Default 25% covers property mgmt (~7%), rates, insurance, vacancy, minor maint.
        </p>
      </Field>
      <Output>
        <Stat label="Gross yield" value={fmtPct(grossYield)} highlight />
        <Stat label="Net yield" value={fmtPct(netYield)} />
        <Stat label="Annual rent" value={fmtCurrency(annualRent)} />
        <Stat label="Net annual" value={fmtCurrency(annualRent - annualCosts)} />
      </Output>
      <Disclaimer>Excludes interest, depreciation and tax. For after-tax view, use the full PIA module.</Disclaimer>
    </Card>
  );
}

// ─── Calculator 2: Stamp Duty by State ─────────────────────────────────────

type AusState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "ACT" | "TAS" | "NT";

// Simplified 2026 standard duty (investor / non-FHB, owner-occupier).
// Source: state revenue offices. Approximations — verify before signing.
function standardDuty(state: AusState, price: number): number {
  // Brackets are [upper-bound (or Infinity), base, rate-on-excess-over-prev]
  const brackets: Record<AusState, [number, number, number][]> = {
    NSW: [
      [16000, 0, 0.0125],
      [35000, 200, 0.015],
      [97000, 485, 0.0175],
      [364000, 1570, 0.035],
      [1212000, 10915, 0.045],
      [Infinity, 49075, 0.055],
    ],
    VIC: [
      [25000, 0, 0.014],
      [130000, 350, 0.024],
      [960000, 2870, 0.06],
      [Infinity, 52670, 0.065],
    ],
    QLD: [
      [5000, 0, 0],
      [75000, 0, 0.015],
      [540000, 1050, 0.035],
      [1000000, 17325, 0.045],
      [Infinity, 38025, 0.0575],
    ],
    WA: [
      [120000, 0, 0.019],
      [150000, 2280, 0.0285],
      [360000, 3135, 0.0375],
      [725000, 11115, 0.0475],
      [Infinity, 28453, 0.0515],
    ],
    SA: [
      [12000, 0, 0.01],
      [30000, 120, 0.02],
      [50000, 480, 0.03],
      [100000, 1080, 0.035],
      [200000, 2830, 0.04],
      [250000, 6830, 0.0425],
      [300000, 8955, 0.0475],
      [500000, 11330, 0.05],
      [Infinity, 21330, 0.055],
    ],
    ACT: [
      [200000, 0, 0.0149],
      [300000, 2980, 0.027],
      [500000, 5680, 0.0316],
      [750000, 13580, 0.0411],
      [1000000, 23855, 0.0497],
      [1455000, 36280, 0.0573],
      [Infinity, 62402, 0.07],
    ],
    TAS: [
      [3000, 0, 0],
      [25000, 50, 0.0175],
      [75000, 435, 0.0225],
      [200000, 1560, 0.035],
      [375000, 5935, 0.04],
      [725000, 12935, 0.0425],
      [Infinity, 27810, 0.045],
    ],
    NT: [
      [Infinity, 0, 0.04949], // simplified flat-ish — NT uses a complex formula
    ],
  };
  const table = brackets[state];
  let prevUpper = 0;
  for (const [upper, base, rate] of table) {
    if (price <= upper) return base + (price - prevUpper) * rate;
    prevUpper = upper;
  }
  return 0;
}

// FHB concession thresholds — 2026 indicative
const FHB_FULL_CAP: Record<AusState, number> = {
  NSW: 800000,
  VIC: 600000,
  QLD: 700000,
  WA: 530000,
  SA: 650000,
  ACT: 1000000, // ACT income-tested; cap shown is approximate property cap for new builds
  TAS: 600000,
  NT: 650000,
};
const FHB_PARTIAL_CAP: Record<AusState, number> = {
  NSW: 1000000,
  VIC: 750000,
  QLD: 800000,
  WA: 601000,
  SA: 700000,
  ACT: 1455000,
  TAS: 750000,
  NT: 750000,
};

function fhbDuty(state: AusState, price: number): number {
  if (price <= FHB_FULL_CAP[state]) return 0;
  if (price >= FHB_PARTIAL_CAP[state]) return standardDuty(state, price);
  // Linear taper between full cap (0 duty) and partial cap (full duty)
  const standard = standardDuty(state, price);
  const taper =
    (price - FHB_FULL_CAP[state]) /
    (FHB_PARTIAL_CAP[state] - FHB_FULL_CAP[state]);
  return standard * taper;
}

function StampDutyCalculator() {
  const [price, setPrice] = useState(700000);
  const [state, setState] = useState<AusState>("QLD");
  const [isFhb, setIsFhb] = useState(true);

  const standard = standardDuty(state, price);
  const fhb = fhbDuty(state, price);
  const payable = isFhb ? fhb : standard;
  const saving = isFhb ? standard - fhb : 0;

  return (
    <Card title="Stamp duty by state" emoji="📋">
      <Field label="Purchase price">
        <NumberInput value={price} onChange={setPrice} prefix="$" step={10000} />
      </Field>
      <Field label="State">
        <select
          value={state}
          onChange={(e) => setState(e.target.value as AusState)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          {(["NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "NT"] as AusState[]).map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field label="">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isFhb}
            onChange={(e) => setIsFhb(e.target.checked)}
            className="rounded"
          />
          First-home buyer
        </label>
      </Field>
      <Output>
        <Stat label="Duty payable" value={fmtCurrency(payable)} highlight />
        {isFhb && saving > 0 && (
          <Stat label="FHB saving" value={fmtCurrency(saving)} className="text-green-600" />
        )}
        <Stat label="Standard duty" value={fmtCurrency(standard)} />
      </Output>
      <Disclaimer>
        Indicative 2026 figures. State revenue offices update brackets and
        concession caps frequently — verify with the relevant state body
        before contract.
      </Disclaimer>
    </Card>
  );
}

// ─── Calculator 3: Borrowing Capacity ──────────────────────────────────────

function BorrowingCalculator() {
  const [income, setIncome] = useState(120000);
  const [partner, setPartner] = useState(0);
  const [dependents, setDependents] = useState(0);
  const [debts, setDebts] = useState(0); // monthly
  const [rate, setRate] = useState(6.5);

  // Approximate net income (PAYG, simple income-tax)
  const netAnnual = (gross: number) => {
    if (gross <= 18200) return gross;
    if (gross <= 45000) return gross - (gross - 18200) * 0.16;
    if (gross <= 135000) return gross - (4288 + (gross - 45000) * 0.30);
    if (gross <= 190000) return gross - (31288 + (gross - 135000) * 0.37);
    return gross - (51638 + (gross - 190000) * 0.45);
  };
  const totalNet = netAnnual(income) + netAnnual(partner);
  const monthlyNet = totalNet / 12;

  // HEM-style minimum living expenses
  const baseHem = partner > 0 ? 3200 : 2000; // single vs couple monthly
  const hemPerKid = 400;
  const livingExp = baseHem + dependents * hemPerKid;

  // Surplus available for repayments
  const surplus = monthlyNet - livingExp - debts;
  // Add 3% buffer over current rate (APRA serviceability test)
  const stressRate = (rate + 3) / 100;
  // Convert surplus → max loan via standard mortgage formula (30yr P&I)
  const months = 30 * 12;
  const r = stressRate / 12;
  const maxLoan = surplus > 0 ? (surplus * (1 - Math.pow(1 + r, -months))) / r : 0;

  return (
    <Card title="Borrowing capacity" emoji="💰">
      <Field label="Your gross annual income">
        <NumberInput value={income} onChange={setIncome} prefix="$" step={5000} />
      </Field>
      <Field label="Partner gross income (optional)">
        <NumberInput value={partner} onChange={setPartner} prefix="$" step={5000} />
      </Field>
      <Field label="Dependents">
        <NumberInput value={dependents} onChange={setDependents} step={1} />
      </Field>
      <Field label="Monthly debt commitments">
        <NumberInput value={debts} onChange={setDebts} prefix="$" step={50} />
      </Field>
      <Field label={`Current rate — ${rate.toFixed(2)}%`}>
        <input
          type="range"
          min={4}
          max={10}
          step={0.25}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-gray-500 mt-1">
          APRA serviceability test adds a +3% buffer ({(rate + 3).toFixed(2)}%).
        </p>
      </Field>
      <Output>
        <Stat label="Estimated max loan" value={fmtCurrency(maxLoan)} highlight />
        <Stat label="Monthly surplus" value={fmtCurrency(surplus)} />
        <Stat label="Monthly net income" value={fmtCurrency(monthlyNet)} />
      </Output>
      <Disclaimer>
        Lender-agnostic estimate using HEM-equivalent expenses and APRA's
        +3% serviceability buffer. Actual capacity varies by lender, credit
        history, deposit size, and policy quirks. Always confirm with a
        licensed broker.
      </Disclaimer>
    </Card>
  );
}

// ─── Calculator 4: Capital Growth Projection ───────────────────────────────

function GrowthCalculator() {
  const [pv, setPv] = useState(700000);
  const [rate, setRate] = useState(5);

  const project = (years: number) => pv * Math.pow(1 + rate / 100, years);

  return (
    <Card title="Capital growth projection" emoji="📈">
      <Field label="Current value">
        <NumberInput value={pv} onChange={setPv} prefix="$" step={10000} />
      </Field>
      <Field label={`Annual growth rate — ${rate.toFixed(1)}%`}>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-xs text-gray-500 mt-1">
          ABS long-run national average ≈4–5%. Higher for growth corridors,
          lower for inner-city established.
        </p>
      </Field>
      <Output>
        <Stat label="In 5 years" value={fmtCurrency(project(5))} />
        <Stat label="In 10 years" value={fmtCurrency(project(10))} highlight />
        <Stat label="In 20 years" value={fmtCurrency(project(20))} />
      </Output>
      <Disclaimer>
        Compound growth, nominal (not inflation-adjusted). Past growth is
        not indicative of future performance — capital can also fall.
      </Disclaimer>
    </Card>
  );
}

// ─── Calculator 5: First Home Guarantee Eligibility ────────────────────────

const FHG_INCOME_SINGLE = 125000;
const FHG_INCOME_COUPLE = 200000;
const FHG_PRICE_CAP: Record<AusState, [number, number]> = {
  // [capital city, regional]
  NSW: [900000, 750000],
  VIC: [800000, 650000],
  QLD: [700000, 550000],
  WA: [600000, 450000],
  SA: [600000, 450000],
  ACT: [750000, 750000],
  TAS: [600000, 450000],
  NT: [600000, 450000],
};

function FhgEligibilityCalculator() {
  const [state, setState] = useState<AusState>("QLD");
  const [region, setRegion] = useState<"capital" | "regional">("capital");
  const [income, setIncome] = useState(110000);
  const [partnerIncome, setPartnerIncome] = useState(0);
  const [price, setPrice] = useState(680000);

  const isCouple = partnerIncome > 0;
  const totalIncome = income + partnerIncome;
  const incomeCap = isCouple ? FHG_INCOME_COUPLE : FHG_INCOME_SINGLE;
  const incomeOk = totalIncome <= incomeCap;
  const priceCap = FHG_PRICE_CAP[state][region === "capital" ? 0 : 1];
  const priceOk = price <= priceCap;
  const eligible = incomeOk && priceOk;

  // LMI saving estimate: typical LMI on 95% LVR is 2-3% of loan amount
  const loanAmount = price * 0.95;
  const lmiEst = loanAmount * 0.025;

  return (
    <Card title="First Home Guarantee check" emoji="🛡️">
      <Field label="State">
        <select
          value={state}
          onChange={(e) => setState(e.target.value as AusState)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          {(["NSW", "VIC", "QLD", "WA", "SA", "ACT", "TAS", "NT"] as AusState[]).map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
      </Field>
      <Field label="Region">
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as "capital" | "regional")}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          <option value="capital">Capital city</option>
          <option value="regional">Regional</option>
        </select>
      </Field>
      <Field label="Your annual gross income">
        <NumberInput value={income} onChange={setIncome} prefix="$" step={5000} />
      </Field>
      <Field label="Partner income (optional)">
        <NumberInput value={partnerIncome} onChange={setPartnerIncome} prefix="$" step={5000} />
      </Field>
      <Field label="Property price">
        <NumberInput value={price} onChange={setPrice} prefix="$" step={10000} />
      </Field>
      <Output>
        <Stat
          label="Income test"
          value={incomeOk ? "✓ Pass" : "✗ Fail"}
          className={incomeOk ? "text-green-600" : "text-red-600"}
        />
        <Stat
          label="Property cap test"
          value={priceOk ? "✓ Pass" : "✗ Fail"}
          className={priceOk ? "text-green-600" : "text-red-600"}
        />
        <Stat
          label="Likely eligible?"
          value={eligible ? "Yes" : "No"}
          className={eligible ? "text-green-600 font-bold" : "text-red-600 font-bold"}
          highlight
        />
        {eligible && (
          <Stat label="Est. LMI saving" value={fmtCurrency(lmiEst)} className="text-green-600" />
        )}
        <Stat label="Income cap" value={fmtCurrency(incomeCap)} />
        <Stat label="Property cap" value={fmtCurrency(priceCap)} />
      </Output>
      <Disclaimer>
        Federal scheme via Housing Australia. Caps adjust periodically;
        annual allocations (35,000) can sell out before financial year-end.
        Other tests apply (citizenship, owner-occupier, no prior property).
      </Disclaimer>
    </Card>
  );
}

// ─── Calculator 6: Loan Repayments ─────────────────────────────────────────

function LoanRepaymentCalculator() {
  const [loan, setLoan] = useState(600000);
  const [rate, setRate] = useState(6.25);
  const [years, setYears] = useState(30);

  const months = years * 12;
  const r = rate / 100 / 12;
  const piMonthly = (loan * r) / (1 - Math.pow(1 + r, -months));
  const ioMonthly = loan * r;
  const totalInterestPi = piMonthly * months - loan;

  return (
    <Card title="Loan repayments" emoji="🏠">
      <Field label="Loan amount">
        <NumberInput value={loan} onChange={setLoan} prefix="$" step={10000} />
      </Field>
      <Field label={`Interest rate — ${rate.toFixed(2)}%`}>
        <input
          type="range"
          min={4}
          max={10}
          step={0.05}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full"
        />
      </Field>
      <Field label={`Term — ${years} years`}>
        <input
          type="range"
          min={10}
          max={30}
          step={1}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="w-full"
        />
      </Field>
      <Output>
        <Stat label="P&I monthly" value={fmtCurrency(piMonthly)} highlight />
        <Stat label="IO monthly" value={fmtCurrency(ioMonthly)} />
        <Stat label="P&I weekly equiv" value={fmtCurrency((piMonthly * 12) / 52)} />
        <Stat label="Total interest (P&I)" value={fmtCurrency(totalInterestPi)} />
      </Output>
      <Disclaimer>
        Standard P&I amortisation formula and IO interest-only. Excludes
        comparison rate adjustments, fees, and offset benefits.
      </Disclaimer>
    </Card>
  );
}

// ─── Shared UI primitives ──────────────────────────────────────────────────

function Card({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col">
      <h3 className="text-base font-semibold mb-4 flex items-center gap-2">
        <span aria-hidden="true">{emoji}</span>
        {title}
      </h3>
      <div className="flex-1 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-medium text-gray-600 mb-1">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  prefix,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  step?: number;
}) {
  return (
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          {prefix}
        </span>
      )}
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className={`w-full ${prefix ? "pl-7" : "pl-3"} pr-3 py-2 border border-gray-300 rounded-md text-sm`}
      />
    </div>
  );
}

function Output({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 pt-3 border-t border-gray-100 space-y-1.5">
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
  className = "",
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`${highlight ? "text-lg font-bold" : "text-sm font-medium"} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}

function Disclaimer({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
      <em>{children}</em>
    </p>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

import DisclaimerBanner from "./DisclaimerBanner";

export default function WarRoomCalculators() {
  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Quick calculators</h2>
          <p className="text-xs text-gray-500 mt-1">
            PIA-style advisor tools — instant numbers for client calls. For deeper analysis use the
            <a href="/pia" className="text-blue-600 hover:underline mx-1">PIA Modeller</a>.
          </p>
        </div>
      </div>

      <DisclaimerBanner variant="compact" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <YieldCalculator />
        <StampDutyCalculator />
        <BorrowingCalculator />
        <GrowthCalculator />
        <FhgEligibilityCalculator />
        <LoanRepaymentCalculator />
      </div>
    </section>
  );
}
