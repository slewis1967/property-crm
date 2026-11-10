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
import {
  AUS_STATES,
  autoAnnualCosts,
  capacityLevers,
  CAPACITY_LEVER_DISCLAIMER,
  computeCapacity,
  CURRENT_TAX_YEAR,
  emptyProperty,
  fhbDuty,
  hecsEffectiveRate,
  ngRestrictionApplies,
  standardDeduction,
  standardDuty,
  TAX_YEARS,
  type AssessedProperty,
  type AusState,
  type ExistingProperty,
  type PropertyUse,
  type TaxYear,
} from "../../utils/finance";
import CapacityLevers from "./CapacityLevers";

// ─── Reusability props ─────────────────────────────────────────────────────
//
// Every calculator below accepts an optional `initial` snapshot (to
// pre-fill its inputs from a saved scenario) and an optional `onChange`
// callback (fired on every state change with the current inputs +
// computed outputs). Callers — like the opportunity detail page's
// "Calculations" section — use those to load + save scenarios.

// A calculator snapshot is a heterogeneous, JSON-serialisable bag: the values
// are the primitives each calculator reads/writes plus the borrowing
// calculator's existing-property array. Persisted as-is to the
// opportunity_calculations table, so it stays deliberately loose but typed.
type CalcValue = number | string | boolean | null | ExistingProperty[];
export type CalcInputs = Record<string, CalcValue>;
export type CalcOutputs = Record<string, CalcValue>;

export type CalcSnapshot = { inputs: CalcInputs; outputs: CalcOutputs };

// Every field any calculator can be pre-filled from (a saved scenario's inputs
// or a lead prefill). All optional — each calculator reads only the keys it
// knows and falls back to its own default for the rest.
export type CalcInitial = {
  // Rental yield
  price?: number;
  weekly?: number;
  costsPct?: number;
  // Stamp duty
  state?: AusState;
  isFhb?: boolean;
  // Borrowing capacity
  taxYear?: TaxYear;
  income?: number;
  partner?: number;
  otherIncome?: number;
  hasHecs?: boolean;
  partnerHasHecs?: boolean;
  hecsBalance?: number;
  claimsStandardDeduction?: boolean;
  dependents?: number;
  declaredExpenses?: number;
  deposit?: number;
  closingCosts?: number;
  newWeeklyRent?: number;
  newPropertyIsNewBuild?: boolean;
  properties?: ExistingProperty[];
  creditLimit?: number;
  personalLoan?: number;
  carLoan?: number;
  otherDebts?: number;
  consumerDebtBalance?: number;
  rate?: number;
  buffer?: number;
  loanTerm?: number;
  rentShading?: number;
  dtiCap?: number;
  negativeGearing?: boolean;
  // Legacy single-mortgage fields, folded into `properties` on load
  existingMortgageBalance?: number;
  existingMortgageRate?: number;
  existingMortgageTerm?: number;
  // Capital growth
  pv?: number;
  // First Home Guarantee
  region?: "capital" | "regional";
  partnerIncome?: number;
  // Loan repayments
  loan?: number;
  years?: number;
};

export type CalcProps = {
  initial?: CalcInitial;
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
// Thin UI over `utils/finance` — all the maths (tax, HEM, portfolio
// assessment, DTI, duty-adjusted purchase price) lives there and is
// unit-tested. This file only collects inputs and renders outputs.
//
// The portfolio section takes each existing property at a deliberately high
// level: one pooled "annual running costs" number rather than a dozen line
// items, because an advisor on a 30-minute call has the loan balance and the
// rent to hand, not the strata invoice. Leave costs on Auto and the engine
// estimates them from rent (investments) or value (owner-occupied).

let propertyIdCounter = 0;
function newPropertyId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `p${++propertyIdCounter}`;
}

/**
 * Saved snapshots predate the portfolio array — they stored a single existing
 * home loan as three flat fields. Fold that into one property so an opportunity
 * saved last month reopens with its numbers intact.
 */
function migrateProperties(initial: CalcProps["initial"]): ExistingProperty[] {
  if (Array.isArray(initial?.properties)) {
    return initial.properties.map((p: Partial<ExistingProperty>) => ({
      ...emptyProperty(p.id ?? newPropertyId()),
      ...p,
    }));
  }
  if ((initial?.existingMortgageBalance ?? 0) > 0) {
    return [
      {
        ...emptyProperty(newPropertyId(), "Existing home"),
        use: "owner_occupied",
        loanBalance: initial!.existingMortgageBalance ?? 0,
        rate: initial!.existingMortgageRate ?? 6.5,
        termRemaining: initial!.existingMortgageTerm ?? 25,
      },
    ];
  }
  return [];
}

export function BorrowingCalculator({ initial, onChange }: CalcProps = {}) {
  // Assessment year — drives the marginal rates, the standard deduction, and
  // whether the 2027-28 negative-gearing restriction applies.
  const [taxYear, setTaxYear] = useState<TaxYear>(initial?.taxYear ?? CURRENT_TAX_YEAR);

  // Income
  const [income, setIncome] = useState<number>(initial?.income ?? 120000);
  const [partner, setPartner] = useState<number>(initial?.partner ?? 0);
  const [otherIncome, setOtherIncome] = useState<number>(initial?.otherIncome ?? 0);
  const [hasHecs, setHasHecs] = useState<boolean>(initial?.hasHecs ?? false);
  const [partnerHasHecs, setPartnerHasHecs] = useState<boolean>(initial?.partnerHasHecs ?? false);
  const [hecsBalance, setHecsBalance] = useState<number>(initial?.hecsBalance ?? 0);
  const [claimsStandardDeduction, setClaimsStandardDeduction] = useState<boolean>(
    initial?.claimsStandardDeduction ?? true,
  );

  // Household
  const [dependents, setDependents] = useState<number>(initial?.dependents ?? 0);
  const [declaredExpenses, setDeclaredExpenses] = useState<number>(initial?.declaredExpenses ?? 0);

  // Deposit + purchase. Deposit auto-fills from contact.existing_savings via
  // borrowingInitialFromLead; duty and closing costs come off it before any
  // of it reaches the purchase price.
  const [deposit, setDeposit] = useState<number>(initial?.deposit ?? 0);
  const [state, setState] = useState<AusState>(initial?.state ?? "QLD");
  const [isFhb, setIsFhb] = useState<boolean>(initial?.isFhb ?? false);
  const [closingCosts, setClosingCosts] = useState<number>(initial?.closingCosts ?? 3000);
  const [newWeeklyRent, setNewWeeklyRent] = useState<number>(initial?.newWeeklyRent ?? 0);
  const [newPropertyIsNewBuild, setNewPropertyIsNewBuild] = useState<boolean>(
    initial?.newPropertyIsNewBuild ?? false,
  );

  // Existing portfolio
  const [properties, setProperties] = useState<ExistingProperty[]>(() => migrateProperties(initial));

  // Consumer debts
  const [creditLimit, setCreditLimit] = useState<number>(initial?.creditLimit ?? 0);
  const [personalLoan, setPersonalLoan] = useState<number>(initial?.personalLoan ?? 0);
  const [carLoan, setCarLoan] = useState<number>(initial?.carLoan ?? 0);
  const [otherDebts, setOtherDebts] = useState<number>(initial?.otherDebts ?? 0);
  const [consumerDebtBalance, setConsumerDebtBalance] = useState<number>(
    initial?.consumerDebtBalance ?? 0,
  );

  // Loan parameters
  const [rate, setRate] = useState<number>(initial?.rate ?? 6.5);
  const [buffer, setBuffer] = useState<number>(initial?.buffer ?? 3);
  const [loanTerm, setLoanTerm] = useState<number>(initial?.loanTerm ?? 30);
  const [rentShading, setRentShading] = useState<number>(initial?.rentShading ?? 0.8);
  const [dtiCap, setDtiCap] = useState<number>(initial?.dtiCap ?? 6);
  const [negativeGearing, setNegativeGearing] = useState<boolean>(initial?.negativeGearing ?? true);

  const inputs = {
    taxYear,
    income, partner, otherIncome, hasHecs, partnerHasHecs,
    hecsBalance: hecsBalance > 0 ? hecsBalance : null,
    claimsStandardDeduction,
    dependents, declaredExpenses,
    deposit, state, isFhb, closingCosts, newWeeklyRent, newPropertyIsNewBuild,
    properties,
    creditLimit, personalLoan, carLoan, otherDebts, consumerDebtBalance,
    rate, buffer, loanTerm, rentShading, dtiCap, negativeGearing,
  };

  // Inputs is rebuilt every render, so memoise on its serialised value rather
  // than its identity — same trick useCalcSync uses.
  const inputsSig = JSON.stringify(inputs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const r = useMemo(() => computeCapacity(inputs), [inputsSig]);
  // Quantified "ways to increase capacity" suggestions, derived from the result.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const levers = useMemo(() => capacityLevers(inputs, r), [inputsSig, r]);

  useCalcSync(
    {
      inputs,
      outputs: {
        taxYear: r.taxYear,
        maxLoan: r.maxLoan,
        maxLoanByServicing: r.maxLoanByServicing,
        maxLoanByDti: r.maxLoanByDti,
        bindingConstraint: r.bindingConstraint,
        dtiAtMax: r.dtiAtMax,
        monthlyNet: r.monthlyNet,
        medicareLevy: r.medicareLevy,
        livingExp: r.livingExp,
        hem: r.hem,
        consumerDebtCommit: r.consumerDebtCommit,
        portfolioNetMonthly: r.portfolioNetMonthly,
        portfolioDebt: r.portfolioDebt,
        portfolioEquity: r.portfolioEquity,
        deductibleLoss: r.deductibleLoss,
        disallowedLoss: r.disallowedLoss,
        negativeGearingBenefitMonthly: r.negativeGearingBenefitMonthly,
        surplus: r.surplus,
        purchasePrice: r.purchasePrice,
        stampDuty: r.stampDuty,
        depositShortfall: r.depositShortfall,
        lvr: r.lvr,
        lmiPremium: r.lmiPremium,
        needsLmi: r.needsLmi,
      },
    },
    onChange,
  );

  const updateProperty = (id: string, patch: Partial<ExistingProperty>) =>
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addProperty = () =>
    setProperties((prev) => [
      ...prev,
      { ...emptyProperty(newPropertyId(), `Property ${prev.length + 1}`) },
    ]);
  const removeProperty = (id: string) =>
    setProperties((prev) => prev.filter((p) => p.id !== id));

  return (
    <Card title="Borrowing capacity" emoji="💰">
      <Field label="Assessment year">
        <select
          value={taxYear}
          onChange={(e) => setTaxYear(e.target.value as TaxYear)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
        >
          {TAX_YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
              {y === CURRENT_TAX_YEAR ? " (current)" : ""}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 mt-1">
          {taxYear === "2025-26" && "16c lowest bracket. No standard deduction."}
          {taxYear === "2026-27" &&
            "15c lowest bracket, $1,000 standard deduction. Negative gearing unrestricted."}
          {taxYear === "2027-28" &&
            "14c lowest bracket. Negative gearing limited to new builds and grandfathered property."}
        </p>
      </Field>

      <SubHeading>Income</SubHeading>
      <Field label="Your gross annual income">
        <NumberInput value={income} onChange={setIncome} prefix="$" step={5000} />
      </Field>
      <CheckboxRow
        checked={hasHecs}
        onChange={setHasHecs}
        label={`HECS/HELP debt (repays ~${fmtCurrency(r.applicantTax.hecs)}/yr, ${(hecsEffectiveRate(income, taxYear) * 100).toFixed(1)}% of income)`}
      />
      {hasHecs && (
        <Field label="HECS/HELP balance owing (optional — caps the repayment)">
          <NumberInput value={hecsBalance} onChange={setHecsBalance} prefix="$" step={1000} />
        </Field>
      )}
      <Field label="Partner gross income (optional)">
        <NumberInput value={partner} onChange={setPartner} prefix="$" step={5000} />
      </Field>
      {partner > 0 && (
        <CheckboxRow
          checked={partnerHasHecs}
          onChange={setPartnerHasHecs}
          label={`Partner HECS/HELP (~${(hecsEffectiveRate(partner) * 100).toFixed(1)}%)`}
        />
      )}
      <Field label="Other annual income (dividends, trust — shaded 80%)">
        <NumberInput value={otherIncome} onChange={setOtherIncome} prefix="$" step={1000} />
      </Field>
      {standardDeduction(taxYear) > 0 && (
        <CheckboxRow
          checked={claimsStandardDeduction}
          onChange={setClaimsStandardDeduction}
          label={`Claims the ${fmtCurrency(standardDeduction(taxYear))} standard work-expense deduction`}
        />
      )}

      <SubHeading>Household</SubHeading>
      <Field label="Dependents">
        <NumberInput value={dependents} onChange={setDependents} step={1} />
      </Field>
      <Field label={`Declared monthly living expenses (HEM benchmark: ${fmtCurrency(r.hem)})`}>
        <NumberInput value={declaredExpenses} onChange={setDeclaredExpenses} prefix="$" step={50} />
        <p className="text-[11px] text-gray-500 mt-1">
          Lenders assess against the higher of declared or HEM.
        </p>
      </Field>

      <SubHeading>The purchase</SubHeading>
      <Field label="Savings / deposit available">
        <NumberInput value={deposit} onChange={setDeposit} prefix="$" step={5000} />
        <p className="text-[11px] text-gray-500 mt-1">
          Auto-fills from contact&apos;s saved profile. Stamp duty and closing costs come out of
          this before it reaches the purchase price.
        </p>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="State (for duty)">
          <select
            value={state}
            onChange={(e) => setState(e.target.value as AusState)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            {AUS_STATES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Legal / inspections / fees">
          <NumberInput value={closingCosts} onChange={setClosingCosts} prefix="$" step={500} />
        </Field>
      </div>
      <CheckboxRow checked={isFhb} onChange={setIsFhb} label="First-home buyer (duty concession)" />
      <Field label="Expected weekly rent on the new property (0 = owner-occupied)">
        <NumberInput value={newWeeklyRent} onChange={setNewWeeklyRent} prefix="$" step={10} />
      </Field>
      {newWeeklyRent > 0 && (
        <>
          <CheckboxRow
            checked={newPropertyIsNewBuild}
            onChange={setNewPropertyIsNewBuild}
            label="New build"
          />
          <p className="text-[11px] text-gray-500 -mt-1 mb-1">
            From 1 Jul 2027 negative gearing on residential investments is limited to new builds.
            A property bought today is not grandfathered, so on an established dwelling the rental
            loss stops being deductible against wage income.
          </p>
        </>
      )}

      <SubHeading>Existing properties</SubHeading>
      {properties.length === 0 && (
        <p className="text-[11px] text-gray-500 -mt-1">
          None. Add each property the client already owns — its loan, rent and running costs all
          move the number.
        </p>
      )}
      <div className="space-y-3">
        {properties.map((p, idx) => (
          <PropertyRow
            key={p.id}
            property={p}
            assessed={r.assessed[idx]}
            taxYear={taxYear}
            onChange={(patch) => updateProperty(p.id, patch)}
            onRemove={() => removeProperty(p.id)}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={addProperty}
        className="mt-2 w-full py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-md hover:bg-blue-50"
      >
        + Add existing property
      </button>
      {properties.length > 0 && (
        <div className="mt-2 flex justify-between text-[11px] text-gray-500">
          <span>
            Portfolio: {properties.length} {properties.length === 1 ? "property" : "properties"},{" "}
            {fmtCurrency(r.portfolioDebt)} debt, {fmtCurrency(r.portfolioEquity)} equity
          </span>
          <span className={r.portfolioNetMonthly < 0 ? "text-red-600" : "text-green-600"}>
            {r.portfolioNetMonthly < 0 ? "−" : "+"}
            {fmtCurrency(Math.abs(r.portfolioNetMonthly))}/mo
          </span>
        </div>
      )}

      <SubHeading>Consumer debts</SubHeading>
      <Field label="Total credit card limits (assessed at 3.8%/month)">
        <NumberInput value={creditLimit} onChange={setCreditLimit} prefix="$" step={500} />
      </Field>
      <Field label="Personal loan repayments (monthly)">
        <NumberInput value={personalLoan} onChange={setPersonalLoan} prefix="$" step={50} />
      </Field>
      <Field label="Car loan / lease (monthly)">
        <NumberInput value={carLoan} onChange={setCarLoan} prefix="$" step={50} />
      </Field>
      <Field label="Other monthly commitments (BNPL, child support, etc)">
        <NumberInput value={otherDebts} onChange={setOtherDebts} prefix="$" step={50} />
      </Field>
      <Field label="Total personal / car / other loan balances owing">
        <NumberInput value={consumerDebtBalance} onChange={setConsumerDebtBalance} prefix="$" step={1000} />
        <p className="text-[11px] text-gray-500 mt-1">
          Balances feed the DTI ceiling; the monthly figures above feed servicing. Both matter.
        </p>
      </Field>

      <SubHeading>New loan parameters</SubHeading>
      <Field label={`Interest rate — ${rate.toFixed(2)}%`}>
        <input type="range" min={3} max={10} step={0.25} value={rate}
          onChange={(e) => setRate(Number(e.target.value))} className="w-full" />
      </Field>
      <Field label={`Assessment buffer — +${buffer.toFixed(1)}% (assess @ ${(rate + buffer).toFixed(2)}%)`}>
        <input type="range" min={1} max={5} step={0.5} value={buffer}
          onChange={(e) => setBuffer(Number(e.target.value))} className="w-full" />
        <p className="text-[11px] text-gray-500 mt-1">APRA mandates +3% minimum.</p>
      </Field>
      <Field label={`Loan term — ${loanTerm} years`}>
        <input type="range" min={10} max={30} step={1} value={loanTerm}
          onChange={(e) => setLoanTerm(Number(e.target.value))} className="w-full" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={`Rent shading — ${(rentShading * 100).toFixed(0)}%`}>
          <input type="range" min={0.6} max={0.9} step={0.05} value={rentShading}
            onChange={(e) => setRentShading(Number(e.target.value))} className="w-full" />
        </Field>
        <Field label={`DTI cap — ${dtiCap.toFixed(1)}×`}>
          <input type="range" min={4} max={9} step={0.5} value={dtiCap}
            onChange={(e) => setDtiCap(Number(e.target.value))} className="w-full" />
        </Field>
      </div>
      <CheckboxRow
        checked={negativeGearing}
        onChange={setNegativeGearing}
        label="Recognise negative-gearing tax benefit"
      />
      <p className="text-[11px] text-gray-500 -mt-1">
        Lenders vary on whether they add this back. Untick for the conservative view.
      </p>

      <Output>
        <Stat label="Estimated max loan" value={fmtCurrency(r.maxLoan)} highlight />
        {r.maxLoan > 0 && (
          <p className="text-[11px] text-gray-500 -mt-0.5">
            {r.bindingConstraint === "dti"
              ? `Capped by the ${dtiCap}× DTI ceiling — servicing alone would allow ${fmtCurrency(r.maxLoanByServicing)}.`
              : `Limited by servicing. DTI at this loan is ${r.dtiAtMax.toFixed(1)}× (cap ${dtiCap}×).`}
          </p>
        )}
        {deposit > 0 && r.maxLoan > 0 && (
          <>
            <Stat label="Max purchase price" value={fmtCurrency(r.purchasePrice)} highlight />
            <Stat label={`Stamp duty (${state}${isFhb ? ", FHB" : ""})`} value={fmtCurrency(r.stampDuty)} />
            <Stat label="Legal / inspections / fees" value={fmtCurrency(closingCosts)} />
            <Stat label={`LVR — ${r.lvr.toFixed(1)}%`} value={r.lvr <= 80 ? "no LMI" : "LMI applies"} />
            {r.needsLmi && (
              <Stat
                label={`Indicative LMI premium (${(r.lmiRate * 100).toFixed(2)}%)`}
                value={fmtCurrency(r.lmiPremium)}
              />
            )}
            {r.depositShortfall > 0 && (
              <p className="text-[11px] text-red-600 mt-1">
                Deposit is {fmtCurrency(r.depositShortfall)} short of stamp duty plus closing costs
                — before a single dollar goes toward the property.
              </p>
            )}
          </>
        )}
        <Stat label="Monthly net income" value={fmtCurrency(r.monthlyNet)} />
        {properties.length > 0 && (
          <Stat
            label="Portfolio net (rent − repayments − costs)"
            value={fmtCurrency(r.portfolioNetMonthly)}
            className={r.portfolioNetMonthly < 0 ? "text-red-600" : "text-green-600"}
          />
        )}
        {newWeeklyRent > 0 && (
          <Stat label="New property rent (shaded)" value={fmtCurrency(r.newPropertyMonthlyRent)} />
        )}
        {r.negativeGearingBenefitMonthly > 0 && (
          <Stat
            label="Negative-gearing tax benefit"
            value={`${fmtCurrency(r.negativeGearingBenefitMonthly)}/mo`}
            className="text-green-600"
          />
        )}
        {r.disallowedLoss > 0 && (
          <p className="text-[11px] text-amber-700 mt-1">
            {fmtCurrency(r.disallowedLoss)}/yr of rental losses are{" "}
            {negativeGearing
              ? "not deductible against wage income in " +
                taxYear +
                " — established dwellings acquired after 12 May 2026 lose negative gearing."
              : "being ignored (negative-gearing benefit switched off)."}
          </p>
        )}
        <Stat label="Household Medicare levy" value={`${fmtCurrency(r.medicareLevy / 12)}/mo`} />
        <Stat label="Living expenses (HEM/declared)" value={fmtCurrency(r.livingExp)} />
        <Stat label="Consumer debt commitments" value={fmtCurrency(r.consumerDebtCommit)} />
        <Stat
          label="Monthly surplus"
          value={fmtCurrency(r.surplus)}
          className={r.surplus < 0 ? "text-red-600" : ""}
        />
        {r.maxLoan > 0 && deposit === 0 && (
          <>
            <Stat label="Indicative deposit @ 80% LVR" value={fmtCurrency(r.maxLoan * 0.25)} />
            <Stat label="Indicative deposit @ 90% LVR" value={fmtCurrency(r.maxLoan * 0.111)} />
            <p className="text-[11px] text-gray-500 mt-1">
              Enter an actual deposit above for max purchase price, duty and LMI.
            </p>
          </>
        )}
      </Output>
      <CapacityLevers levers={levers} disclaimer={CAPACITY_LEVER_DISCLAIMER} />
      <Disclaimer>
        Indicative only. Rates are current to {CURRENT_TAX_YEAR}; the 2026-27 Medicare thresholds
        aren&apos;t published yet, so 2025-26 figures are carried forward. Depreciation and capital
        works aren&apos;t modelled, so the negative-gearing benefit is understated. Rental losses
        are assumed to attach to the higher earner. Real capacity also turns on postcode caps,
        casual-income shading and FBT grossing. Always confirm with a licensed broker — and on the
        negative-gearing and CGT changes, a tax adviser.
      </Disclaimer>
    </Card>
  );
}

/**
 * One existing property. Collapsed to essentials: what it's worth, what's
 * owed, what it earns, what it costs. Running costs default to Auto — the
 * engine derives them from rent (investment) or value (owner-occupied) —
 * and the advisor can override with a real figure when they have one.
 */
function PropertyRow({
  property: p,
  assessed,
  taxYear,
  onChange,
  onRemove,
}: {
  property: ExistingProperty;
  assessed?: AssessedProperty;
  taxYear: TaxYear;
  onChange: (patch: Partial<ExistingProperty>) => void;
  onRemove: () => void;
}) {
  const net = assessed?.netMonthly ?? 0;
  // The grandfathering / new-build flags only change the answer once the
  // restriction is live, so don't clutter the row before then.
  const ngMatters = ngRestrictionApplies(taxYear) && p.use === "investment";
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
      <div className="flex items-center gap-2 mb-2">
        <input
          value={p.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Address or nickname"
          className="flex-1 px-2 py-1 text-xs font-medium border border-gray-300 rounded bg-white"
        />
        <select
          value={p.use}
          onChange={(e) => onChange({ use: e.target.value as PropertyUse })}
          className="px-2 py-1 text-xs border border-gray-300 rounded bg-white"
        >
          <option value="investment">Investment</option>
          <option value="owner_occupied">Owner-occupied</option>
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${p.label}`}
          className="text-gray-400 hover:text-red-600 px-1 text-sm"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Value">
          <NumberInput value={p.value} onChange={(v) => onChange({ value: v })} prefix="$" step={10000} />
        </Field>
        <Field label="Loan balance">
          <NumberInput value={p.loanBalance} onChange={(v) => onChange({ loanBalance: v })} prefix="$" step={10000} />
        </Field>
      </div>

      {p.loanBalance > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={`Rate — ${p.rate.toFixed(2)}%`}>
              <input type="range" min={3} max={10} step={0.25} value={p.rate}
                onChange={(e) => onChange({ rate: Number(e.target.value) })} className="w-full" />
            </Field>
            <Field label={`Years remaining — ${p.termRemaining}`}>
              <input type="range" min={1} max={30} step={1} value={p.termRemaining}
                onChange={(e) => onChange({ termRemaining: Number(e.target.value) })} className="w-full" />
            </Field>
          </div>
          <CheckboxRow
            checked={p.interestOnly}
            onChange={(v) => onChange({ interestOnly: v })}
            label="Interest-only"
          />
          {p.interestOnly && (
            <Field label={`Interest-only years left — ${p.ioYearsRemaining}`}>
              <input type="range" min={1} max={10} step={1} value={p.ioYearsRemaining}
                onChange={(e) => onChange({ ioYearsRemaining: Number(e.target.value) })} className="w-full" />
              <p className="text-[11px] text-gray-500 mt-1">
                Assessed P&amp;I over the {Math.max(1, p.termRemaining - p.ioYearsRemaining)} years
                left after IO expires — which is why IO hurts capacity.
              </p>
            </Field>
          )}
        </>
      )}

      {p.use === "investment" && (
        <Field label="Weekly rent">
          <NumberInput value={p.weeklyRent} onChange={(v) => onChange({ weeklyRent: v })} prefix="$" step={10} />
        </Field>
      )}

      {ngMatters && (
        <div className="mt-1 mb-1">
          <CheckboxRow
            checked={p.heldBeforeNgCutoff}
            onChange={(v) => onChange({ heldBeforeNgCutoff: v })}
            label="Held at 12 May 2026 (grandfathered)"
          />
          {!p.heldBeforeNgCutoff && (
            <CheckboxRow
              checked={p.isNewBuild}
              onChange={(v) => onChange({ isNewBuild: v })}
              label="New build"
            />
          )}
          {assessed && assessed.annualTaxLoss > 0 && !assessed.negativeGearingAllowed && (
            <p className="text-[11px] text-amber-700 mt-1">
              {fmtCurrency(assessed.annualTaxLoss)}/yr loss not deductible against wage income in{" "}
              {taxYear}.
            </p>
          )}
        </div>
      )}

      <Field label="Annual running costs — rates, insurance, maintenance, strata, land tax, management">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <NumberInput
              value={p.autoCosts ? Math.round(autoAnnualCosts(p)) : p.annualCosts}
              onChange={(v) => onChange({ annualCosts: v, autoCosts: false })}
              prefix="$"
              step={500}
            />
          </div>
          <label className="flex items-center gap-1 text-[11px] text-gray-600 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={p.autoCosts}
              onChange={(e) => onChange({ autoCosts: e.target.checked })}
              className="rounded border-gray-300"
            />
            Auto
          </label>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          {p.autoCosts
            ? p.use === "investment"
              ? "Estimated at 25% of gross rent (mgmt, vacancy, rates, insurance, maintenance), floored at 0.9% of value."
              : "Estimated at 0.9% of value — rates, insurance, maintenance."
            : "Using your figure. Tick Auto to re-estimate."}
        </p>
      </Field>

      {assessed && (
        <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between text-[11px]">
          <span className="text-gray-500">
            Assessed repayment {fmtCurrency(assessed.monthlyRepayment)}/mo
            {assessed.assessedMonthlyRent > 0 &&
              ` · rent ${fmtCurrency(assessed.assessedMonthlyRent)}/mo`}
          </span>
          <span className={net < 0 ? "text-red-600 font-medium" : "text-green-600 font-medium"}>
            {net < 0 ? "−" : "+"}
            {fmtCurrency(Math.abs(net))}/mo
          </span>
        </div>
      )}
    </div>
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
