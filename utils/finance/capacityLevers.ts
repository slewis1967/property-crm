/**
 * capacityLevers — "ways to increase borrowing capacity" suggestions, computed
 * from an actual `computeCapacity` result. Pure, no React, unit-tested in
 * `capacityLevers.test.ts`.
 *
 * Every lever is QUANTIFIED from the same figures the engine used, so the
 * numbers reconcile with the result the advisor is looking at:
 *
 *   • DTI ceiling  = dtiCap × dtiIncome − existingDebt   (engine's maxLoanByDti
 *                    before the max(0, …) clamp). Negative = over the cap.
 *   • k            = extra loan supported per $1/month of surplus, at the
 *                    assessed rate (rate + buffer) over the loan term — the
 *                    inverse of the servicing formula the engine uses.
 *
 * Levers are generated for whichever constraint BINDS (the lower of the two
 * ceilings), with the other reported as the ceiling you'd hit next.
 *
 * Deliberately NOT suggested: switching to interest-only. Lenders (and this
 * engine) assess IO loans at P&I over the residual term, so IO does not lift
 * assessed capacity — suggesting it would be misleading.
 *
 * These are indicative, not credit advice — see CAPACITY_LEVER_DISCLAIMER.
 */

import {
  CREDIT_CARD_ASSESSMENT_RATE,
  DEFAULT_RENT_SHADING,
  type CapacityInputs,
  type CapacityResult,
} from "./capacity";
import { loanFromMonthly } from "./tax";

export type CapacityLever = { title: string; impact: string; note?: string };

export const CAPACITY_LEVER_DISCLAIMER =
  "These are general suggestions generated automatically from the figures entered — not credit assistance, financial advice, or a recommendation, and they don't reflect any lender's specific policy or your full circumstances. Estimates are indicative and rounded; actual borrowing capacity is set by the lender. Consider speaking with a licensed mortgage broker or credit adviser before acting.";

// ─── Rounding + formatting ──────────────────────────────────────────────────
// Rounding granularity per the brief: loan/debt to $1,000, monthly $ to $10,
// weekly rent to $5, annual income/rent to $500.

const toNum = (n: number) => (Number.isFinite(n) ? n : 0);
const round1000 = (n: number) => Math.round(toNum(n) / 1000) * 1000;
const round500 = (n: number) => Math.round(toNum(n) / 500) * 500;
const round10 = (n: number) => Math.round(toNum(n) / 10) * 10;
const round5 = (n: number) => Math.round(toNum(n) / 5) * 5;

/** "$1,234" — whole dollars, en-AU grouping. */
function money(n: number): string {
  return "$" + Math.round(toNum(n)).toLocaleString("en-AU");
}

/** "6" or "6.5" — JS drops a trailing ".0", so the multiplier reads cleanly. */
function num(n: number): string {
  return String(n);
}

/**
 * Quantified suggestions for lifting borrowing capacity, most-impactful first,
 * capped at five. Grounded entirely in `inputs` + `result`.
 */
export function capacityLevers(inputs: CapacityInputs, result: CapacityResult): CapacityLever[] {
  const levers: CapacityLever[] = [];

  const existingDebt =
    result.portfolioDebt + Math.max(0, inputs.creditLimit) + Math.max(0, inputs.consumerDebtBalance);

  // DTI ceiling before the engine's max(0, …) clamp. Negative ⇒ over the cap.
  const dtiCeiling = inputs.dtiCap * result.dtiIncome - existingDebt;

  // Extra loan supported per $1/month of servicing surplus.
  const k = loanFromMonthly(1, inputs.rate + inputs.buffer, inputs.loanTerm);

  const svc = result.maxLoanByServicing;
  const dti = result.maxLoanByDti;

  // Binding side: DTI binds when it's the lower (or equal) ceiling.
  const dtiBinds = dti <= svc;

  const cap = num(inputs.dtiCap);
  const shade = inputs.rentShading ?? DEFAULT_RENT_SHADING;

  if (dtiBinds) {
    // ── DTI is the binding constraint ────────────────────────────────────────
    const overCap = dtiCeiling < 0;
    const overBy = overCap ? -dtiCeiling : 0;

    // Reduce existing debt.
    if (overCap) {
      levers.push({
        title: "Reduce existing debt",
        impact: `You're ~${money(round1000(overBy))} over the ${cap}× DTI cap, so no new borrowing is available yet — reducing existing debt by ~${money(round1000(overBy))} brings you back under the cap and unlocks new borrowing.`,
        note:
          svc > 0
            ? `Reducing existing debt by ~${money(round1000(overBy + svc))} would take you all the way to the servicing ceiling of ~${money(round1000(svc))}.`
            : undefined,
      });
    } else {
      levers.push({
        title: "Reduce existing debt",
        impact: `You're at the ${cap}× DTI cap. Each $1 of existing debt repaid lifts your DTI ceiling ~$1, up to the ~${money(round1000(svc))} servicing ceiling.`,
      });
    }

    // Increase assessable income / rent (DTI counts gross rent in full).
    if (inputs.dtiCap > 0) {
      const perThousand = inputs.dtiCap * 1000;
      let note: string | undefined;
      if (overCap) {
        const annualRentToClear = overBy / inputs.dtiCap;
        const weekly = annualRentToClear / 52;
        note = `e.g. about +${money(round5(weekly))}/week of total portfolio rent (~${money(round500(annualRentToClear))}/yr gross) would clear the cap.`;
      }
      levers.push({
        title: "Increase assessable income or rent",
        impact: `Each extra $1,000/yr of assessable income lifts the DTI ceiling ~${money(perThousand)} (DTI counts gross rent in full).`,
        note,
      });
    }

    // Context: why DTI is the limit, and where servicing sits.
    levers.push({
      title: "Why DTI is the limit",
      impact: `DTI is the binding limit here (currently ${result.dtiAtMax.toFixed(2)}× vs the ${cap}× cap); on cash-flow (servicing) alone the figures support ~${money(round1000(svc))}.`,
    });
  } else {
    // ── Servicing (cash-flow) is the binding constraint ──────────────────────
    const monthlyCommit =
      Math.max(0, inputs.personalLoan) + Math.max(0, inputs.carLoan) + Math.max(0, inputs.otherDebts);

    // Reduce consumer debt / card limits.
    if (k > 0 && (inputs.creditLimit > 0 || monthlyCommit > 0)) {
      const parts: string[] = [];
      if (inputs.creditLimit > 0) {
        const freed = inputs.creditLimit * CREDIT_CARD_ASSESSMENT_RATE;
        parts.push(
          `Reducing or closing your ${money(inputs.creditLimit)} card limit (assessed at 3.8%/mo of the limit) frees ~${money(round10(freed))}/mo → about ${money(round1000(freed * k))} more borrowing.`,
        );
      }
      if (monthlyCommit > 0) {
        parts.push(
          `Clearing your ${money(round10(monthlyCommit))}/mo of personal/car/other repayments adds about ${money(round1000(monthlyCommit * k))} more.`,
        );
      }
      levers.push({
        title: "Reduce or close consumer debts",
        impact: parts.join(" "),
        note: `Each $1/month of commitment cleared lifts capacity ~${money(round1000(k))}.`,
      });
    }

    // Increase net income / rent (servicing uses shaded rent).
    if (k > 0) {
      const monthly = (100 * 52 * shade) / 12;
      levers.push({
        title: "Increase net income or rent",
        impact: `Each +$100/week of rent adds ~${money(round10(monthly))}/mo (shaded ${Math.round(shade * 100)}%) → about ${money(round1000(monthly * k))} more borrowing. Extra PAYG income lifts it too, net of tax.`,
      });
    }

    // Trim declared living expenses toward HEM — only if declared is the higher
    // figure the engine used (otherwise HEM floors it and there's no lever).
    if (k > 0 && inputs.declaredExpenses > result.hem) {
      const freed = inputs.declaredExpenses - result.hem;
      levers.push({
        title: "Trim declared living expenses toward HEM",
        impact: `Your declared living expenses exceed the HEM benchmark and the assessment uses the higher figure. Trimming declared expenses toward the ~${money(round10(result.hem))}/mo benchmark could free up to ~${money(round10(freed))}/mo → about ${money(round1000(freed * k))} more borrowing.`,
      });
    }

    // Refinance existing lending to a lower rate.
    if (result.portfolioDebt > 0) {
      levers.push({
        title: "Refinance existing lending to a lower rate",
        impact: `Existing loans are assessed at their actual rate plus the ${num(inputs.buffer)}% buffer, so refinancing to a genuinely lower rate reduces the assessed repayment and lifts serviceability.`,
      });
    }

    // Longer new loan term (only if there's headroom below 30 years).
    if (inputs.loanTerm < 30) {
      levers.push({
        title: "Extend the new loan term",
        impact: `Extending the new loan term toward 30 years lowers the assessed repayment per dollar borrowed, lifting the servicing ceiling.`,
      });
    }

    // Context: why servicing is the limit, and where DTI sits.
    if (dti > svc) {
      levers.push({
        title: "Why servicing is the limit",
        impact: `Cash-flow (servicing) is the binding limit here; on DTI alone the figures support ~${money(round1000(dti))}.`,
      });
    }
  }

  // A deposit shortfall blocks completion regardless of which side binds.
  if (result.depositShortfall > 0) {
    levers.push({
      title: "Cover the deposit shortfall",
      impact: `There's a deposit shortfall of ~${money(round1000(result.depositShortfall))} at the assessed loan — additional savings or deposit would be needed to complete the purchase.`,
    });
  }

  // Keep it to the ~5 most impactful (levers are already in priority order).
  return levers.slice(0, 5);
}
