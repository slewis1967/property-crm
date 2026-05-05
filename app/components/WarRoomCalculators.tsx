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
import { useEffect, useMemo, useState } from "react";

// ─── Reusability props ─────────────────────────────────────────────────────
//
// Every calculator below accepts an optional `initial` snapshot (to
// pre-fill its inputs from a saved scenario) and an optional `onChange`
// callback (fired on every state change with the current inputs +
// computed outputs). Callers — like the opportunity detail page's
// "Calculations" section — use those to load + save scenarios.

export type CalcSnapshot = { inputs: Record<string, any>; outputs: Record<string, any> };

export type CalcProps = {
  initial?: Record<string, any>;
  onChange?: (snapshot: CalcSnapshot) => void;
};

// Fire onChange whenever the snapshot changes. JSON.stringify keeps the
// dep array shallow so we don't infinite-loop on object identity churn.
function useCalcSync(snapshot: CalcSnapshot, onChange: CalcProps["onChange"]) {
  const sig = JSON.stringify(snapshot);
  useEffect(() => {
    if (onChange) onChange(snapshot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, !!onChange]);
}

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

export function YieldCalculator({ initial, onChange }: CalcProps = {}) {
  const [price, setPrice] = useState<number>(initial?.price ?? 750000);
  const [weekly, setWeekly] = useState<number>(initial?.weekly ?? 620);
  const [costsPct, setCostsPct] = useState<number>(initial?.costsPct ?? 25);

  const annualRent = weekly * 52;
  const annualCosts = annualRent * (costsPct / 100);
  const grossYield = (annualRent / price) * 100;
  const netYield = ((annualRent - annualCosts) / price) * 100;

  useCalcSync(
    { inputs: { price, weekly, costsPct },
      outputs: { grossYield, netYield, annualRent, netAnnual: annualRent - annualCosts } },
    onChange,
  );

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

export function StampDutyCalculator({ initial, onChange }: CalcProps = {}) {
  const [price, setPrice] = useState<number>(initial?.price ?? 700000);
  const [state, setState] = useState<AusState>(initial?.state ?? "QLD");
  const [isFhb, setIsFhb] = useState<boolean>(initial?.isFhb ?? true);

  const standard = standardDuty(state, price);
  const fhb = fhbDuty(state, price);
  const payable = isFhb ? fhb : standard;
  const saving = isFhb ? standard - fhb : 0;

  useCalcSync(
    { inputs: { price, state, isFhb }, outputs: { payable, saving, standard } },
    onChange,
  );

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
//
// Models the four big things Australian lenders actually look at:
//   1. Net income (PAYG tax + Medicare levy + HELP/HECS deductions, plus
//      partner and shaded "other" income at 80%)
//   2. Living expenses — max(declared, HEM benchmark) by household
//      composition + income tier
//   3. Existing debts — credit card limits assessed at 3.8%/month per
//      APG 223, existing home loans P&I-amortised at the current rate,
//      explicit personal/car loan and other monthly commitments
//   4. Loan capacity — surplus capitalised into a 30yr P&I loan at the
//      assessment rate (current rate + APRA's +3% buffer)
//
// All numbers indicative — lender DTI caps, postcode policy, FBT-grossed
// income etc. vary. Disclaimer at the bottom of the card.

// HEM benchmark approximation (monthly, AUD). Real HEM is the Melbourne
// Institute's quarterly HES survey — this is a simplified table good
// enough for an advisor sanity check.
function hemMonthly(adults: 1 | 2, kids: number, grossHousehold: number): number {
  const tier = grossHousehold >= 200000 ? "high" : grossHousehold >= 100000 ? "mid" : "low";
  // Base for adults
  const base =
    adults === 1
      ? { low: 1640, mid: 1880, high: 2200 }[tier]
      : { low: 2700, mid: 3200, high: 3800 }[tier];
  const perKid =
    tier === "high" ? 700 : tier === "mid" ? 540 : 420;
  return base + Math.max(0, kids) * perKid;
}

// HECS/HELP repayment rate (2024-25 thresholds, applied to repayment
// income — gross is a close-enough proxy for this use case).
function hecsRate(income: number): number {
  if (income < 54435) return 0;
  if (income < 62851) return 0.01;
  if (income < 66621) return 0.02;
  if (income < 70619) return 0.025;
  if (income < 74856) return 0.03;
  if (income < 79347) return 0.035;
  if (income < 84108) return 0.04;
  if (income < 89155) return 0.045;
  if (income < 94504) return 0.05;
  if (income < 100175) return 0.055;
  if (income < 106186) return 0.06;
  if (income < 112557) return 0.065;
  if (income < 119310) return 0.07;
  if (income < 126468) return 0.075;
  if (income < 134057) return 0.08;
  if (income < 142101) return 0.085;
  if (income < 150627) return 0.09;
  if (income < 159664) return 0.095;
  return 0.10;
}

// PAYG income tax incl. 2% Medicare levy (singles, no LITO modelled).
function netAfterTax(gross: number): number {
  const tax =
    gross <= 18200 ? 0 :
    gross <= 45000 ? (gross - 18200) * 0.16 :
    gross <= 135000 ? 4288 + (gross - 45000) * 0.30 :
    gross <= 190000 ? 31288 + (gross - 135000) * 0.37 :
                      51638 + (gross - 190000) * 0.45;
  const medicare = gross > 26000 ? gross * 0.02 : 0;
  return gross - tax - medicare;
}

// P&I monthly repayment for a given balance, rate %, term in years.
function pAndIMonthly(balance: number, ratePct: number, years: number): number {
  if (balance <= 0) return 0;
  const r = ratePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

export function BorrowingCalculator({ initial, onChange }: CalcProps = {}) {
  // Income
  const [income, setIncome] = useState<number>(initial?.income ?? 120000);
  const [partner, setPartner] = useState<number>(initial?.partner ?? 0);
  const [otherIncome, setOtherIncome] = useState<number>(initial?.otherIncome ?? 0);
  const [hasHecs, setHasHecs] = useState<boolean>(initial?.hasHecs ?? false);
  const [partnerHasHecs, setPartnerHasHecs] = useState<boolean>(initial?.partnerHasHecs ?? false);

  // Household
  const [dependents, setDependents] = useState<number>(initial?.dependents ?? 0);
  const [declaredExpenses, setDeclaredExpenses] = useState<number>(initial?.declaredExpenses ?? 0);

  // Existing debts
  const [creditLimit, setCreditLimit] = useState<number>(initial?.creditLimit ?? 0);
  const [existingMortgageBalance, setExistingMortgageBalance] = useState<number>(initial?.existingMortgageBalance ?? 0);
  const [existingMortgageRate, setExistingMortgageRate] = useState<number>(initial?.existingMortgageRate ?? 6.5);
  const [existingMortgageTerm, setExistingMortgageTerm] = useState<number>(initial?.existingMortgageTerm ?? 25);
  const [personalLoan, setPersonalLoan] = useState<number>(initial?.personalLoan ?? 0);
  const [carLoan, setCarLoan] = useState<number>(initial?.carLoan ?? 0);
  const [otherDebts, setOtherDebts] = useState<number>(initial?.otherDebts ?? 0);

  // Loan parameters
  const [rate, setRate] = useState<number>(initial?.rate ?? 6.5);
  const [buffer, setBuffer] = useState<number>(initial?.buffer ?? 3);
  const [loanTerm, setLoanTerm] = useState<number>(initial?.loanTerm ?? 30);

  const adults = partner > 0 ? 2 : 1;
  const grossHousehold = income + partner + otherIncome;

  // Net income (incl. HECS deductions)
  const hecsApplicant = hasHecs ? income * hecsRate(income) : 0;
  const hecsPartner = partnerHasHecs ? partner * hecsRate(partner) : 0;
  const netAnnual =
    netAfterTax(income) - hecsApplicant +
    netAfterTax(partner) - hecsPartner +
    otherIncome * 0.8; // 80% shading on rental/dividend/etc
  const monthlyNet = netAnnual / 12;

  // Living expenses — max of declared and HEM benchmark
  const hem = hemMonthly(adults as 1 | 2, dependents, grossHousehold);
  const livingExp = Math.max(hem, declaredExpenses);

  // Existing debt servicing
  const creditCardCommit = creditLimit * 0.038; // APG 223 standard
  const existingMortgageRepayment = pAndIMonthly(
    existingMortgageBalance,
    existingMortgageRate + buffer, // assess at stressed rate too
    existingMortgageTerm,
  );
  const totalDebtCommit =
    creditCardCommit +
    existingMortgageRepayment +
    personalLoan +
    carLoan +
    otherDebts;

  // Surplus → max new loan at stress rate
  const surplus = monthlyNet - livingExp - totalDebtCommit;
  const stressRate = (rate + buffer) / 100;
  const months = loanTerm * 12;
  const r = stressRate / 12;
  const maxLoan =
    surplus > 0
      ? (surplus * (1 - Math.pow(1 + r, -months))) / r
      : 0;

  useCalcSync(
    {
      inputs: {
        income, partner, otherIncome, hasHecs, partnerHasHecs,
        dependents, declaredExpenses,
        creditLimit, existingMortgageBalance, existingMortgageRate, existingMortgageTerm,
        personalLoan, carLoan, otherDebts,
        rate, buffer, loanTerm,
      },
      outputs: { maxLoan, monthlyNet, livingExp, totalDebtCommit, surplus, hem },
    },
    onChange,
  );

  return (
    <Card title="Borrowing capacity" emoji="💰">
      <SubHeading>Income</SubHeading>
      <Field label="Your gross annual income">
        <NumberInput value={income} onChange={setIncome} prefix="$" step={5000} />
      </Field>
      <CheckboxRow
        checked={hasHecs}
        onChange={setHasHecs}
        label={`HECS/HELP debt (~${(hecsRate(income) * 100).toFixed(1)}% of income)`}
      />
      <Field label="Partner gross income (optional)">
        <NumberInput value={partner} onChange={setPartner} prefix="$" step={5000} />
      </Field>
      {partner > 0 && (
        <CheckboxRow
          checked={partnerHasHecs}
          onChange={setPartnerHasHecs}
          label={`Partner HECS/HELP (~${(hecsRate(partner) * 100).toFixed(1)}%)`}
        />
      )}
      <Field label="Other annual income (rental, dividends — shaded 80%)">
        <NumberInput value={otherIncome} onChange={setOtherIncome} prefix="$" step={1000} />
      </Field>

      <SubHeading>Household</SubHeading>
      <Field label="Dependents">
        <NumberInput value={dependents} onChange={setDependents} step={1} />
      </Field>
      <Field label={`Declared monthly living expenses (HEM benchmark: ${fmtCurrency(hem)})`}>
        <NumberInput value={declaredExpenses} onChange={setDeclaredExpenses} prefix="$" step={50} />
        <p className="text-[11px] text-gray-500 mt-1">
          Lenders assess against the higher of declared or HEM.
        </p>
      </Field>

      <SubHeading>Existing debts</SubHeading>
      <Field label="Total credit card limits (assessed at 3.8%/month)">
        <NumberInput value={creditLimit} onChange={setCreditLimit} prefix="$" step={500} />
      </Field>
      <Field label="Existing home loan balance">
        <NumberInput
          value={existingMortgageBalance}
          onChange={setExistingMortgageBalance}
          prefix="$"
          step={10000}
        />
      </Field>
      {existingMortgageBalance > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Rate — ${existingMortgageRate.toFixed(2)}%`}>
            <input
              type="range"
              min={3}
              max={10}
              step={0.25}
              value={existingMortgageRate}
              onChange={(e) => setExistingMortgageRate(Number(e.target.value))}
              className="w-full"
            />
          </Field>
          <Field label={`Years remaining — ${existingMortgageTerm}`}>
            <input
              type="range"
              min={1}
              max={30}
              step={1}
              value={existingMortgageTerm}
              onChange={(e) => setExistingMortgageTerm(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        </div>
      )}
      <Field label="Personal loan repayments (monthly)">
        <NumberInput value={personalLoan} onChange={setPersonalLoan} prefix="$" step={50} />
      </Field>
      <Field label="Car loan / lease (monthly)">
        <NumberInput value={carLoan} onChange={setCarLoan} prefix="$" step={50} />
      </Field>
      <Field label="Other monthly commitments (BNPL, child support, etc)">
        <NumberInput value={otherDebts} onChange={setOtherDebts} prefix="$" step={50} />
      </Field>

      <SubHeading>New loan parameters</SubHeading>
      <Field label={`Interest rate — ${rate.toFixed(2)}%`}>
        <input
          type="range"
          min={3}
          max={10}
          step={0.25}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-full"
        />
      </Field>
      <Field label={`Assessment buffer — +${buffer.toFixed(1)}% (assess @ ${(rate + buffer).toFixed(2)}%)`}>
        <input
          type="range"
          min={1}
          max={5}
          step={0.5}
          value={buffer}
          onChange={(e) => setBuffer(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-[11px] text-gray-500 mt-1">APRA mandates +3% minimum.</p>
      </Field>
      <Field label={`Loan term — ${loanTerm} years`}>
        <input
          type="range"
          min={10}
          max={30}
          step={1}
          value={loanTerm}
          onChange={(e) => setLoanTerm(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Output>
        <Stat label="Estimated max loan" value={fmtCurrency(maxLoan)} highlight />
        <Stat label="Monthly net income" value={fmtCurrency(monthlyNet)} />
        <Stat label="Living expenses (HEM/declared)" value={fmtCurrency(livingExp)} />
        <Stat label="Existing debt commitments" value={fmtCurrency(totalDebtCommit)} />
        <Stat label="Monthly surplus" value={fmtCurrency(surplus)} />
        {maxLoan > 0 && (
          <>
            <Stat label="Indicative deposit @ 80% LVR" value={fmtCurrency(maxLoan * 0.25)} />
            <Stat label="Indicative deposit @ 90% LVR" value={fmtCurrency(maxLoan * 0.111)} />
          </>
        )}
      </Output>
      <Disclaimer>
        Indicative only. Real lender capacity depends on policy quirks
        (postcode caps, casual income shading, FBT grossing, DTI ceilings,
        existing IP cash-flow treatment). Always confirm with a licensed
        broker before relying on this number.
      </Disclaimer>
    </Card>
  );
}

// ─── Calculator 4: Capital Growth Projection ───────────────────────────────

export function GrowthCalculator({ initial, onChange }: CalcProps = {}) {
  const [pv, setPv] = useState<number>(initial?.pv ?? 700000);
  const [rate, setRate] = useState<number>(initial?.rate ?? 5);

  const project = (years: number) => pv * Math.pow(1 + rate / 100, years);

  useCalcSync(
    { inputs: { pv, rate },
      outputs: { in5: project(5), in10: project(10), in20: project(20) } },
    onChange,
  );

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

export function FhgEligibilityCalculator({ initial, onChange }: CalcProps = {}) {
  const [state, setState] = useState<AusState>(initial?.state ?? "QLD");
  const [region, setRegion] = useState<"capital" | "regional">(initial?.region ?? "capital");
  const [income, setIncome] = useState<number>(initial?.income ?? 110000);
  const [partnerIncome, setPartnerIncome] = useState<number>(initial?.partnerIncome ?? 0);
  const [price, setPrice] = useState<number>(initial?.price ?? 680000);

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

  useCalcSync(
    { inputs: { state, region, income, partnerIncome, price },
      outputs: { eligible, incomeOk, priceOk, incomeCap, priceCap, lmiEst } },
    onChange,
  );

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

export function LoanRepaymentCalculator({ initial, onChange }: CalcProps = {}) {
  const [loan, setLoan] = useState<number>(initial?.loan ?? 600000);
  const [rate, setRate] = useState<number>(initial?.rate ?? 6.25);
  const [years, setYears] = useState<number>(initial?.years ?? 30);

  const months = years * 12;
  const r = rate / 100 / 12;
  const piMonthly = (loan * r) / (1 - Math.pow(1 + r, -months));
  const ioMonthly = loan * r;
  const totalInterestPi = piMonthly * months - loan;

  useCalcSync(
    { inputs: { loan, rate, years },
      outputs: { piMonthly, ioMonthly, totalInterestPi, weeklyEquiv: (piMonthly * 12) / 52 } },
    onChange,
  );

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

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-2 mb-0.5 first:mt-0">
      {children}
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 -mt-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span>{label}</span>
    </label>
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
