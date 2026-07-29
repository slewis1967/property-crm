/**
 * The matching engine — client scenario in, ranked lender shortlist out, with
 * a defensible pass/fail reason and a source URL behind every line.
 *
 * Pure and side-effect free (vitest: `match.test.ts`). It is a rules engine
 * bolted onto the existing servicing calculator, not a second calculator:
 * `estimateMaxLoan()` calls `computeCapacity()` from `utils/finance/capacity.ts`
 * with that lender's own buffer, rent shading, DTI cap, card assessment rate,
 * HEM loading and assessment-rate floor overlaid on the scenario. There is
 * exactly one place in this codebase that knows how to service a loan.
 *
 * ── THE FOUR OUTCOMES, AND WHY THERE ARE FOUR ────────────────────────────
 *   pass    — the lender's published policy permits this.
 *   fail    — the lender's published policy rules it out. A knock-out.
 *   refer   — permitted but outside the normal lane; needs a BDM/exception.
 *   unknown — WE DON'T KNOW. Either the policy isn't researched, the fact
 *             failed verification, or the scenario doesn't carry the input.
 *
 * `unknown` is the load-bearing one. Every check that cannot be evaluated on a
 * *verified* fact returns `unknown`, never `pass`. A lender with no researched
 * credit policy is therefore never reported as "accepts your defaults" — it is
 * reported as "we haven't confirmed their default policy". The whole database
 * is built by an AI reading websites; the engine's job is to make sure that
 * uncertainty stays visible instead of being laundered into a recommendation.
 *
 * ── NOT A CREDIT DECISION ────────────────────────────────────────────────
 * Output is an internal research aid for a licensed broker. It is not a credit
 * assessment, not a pre-approval, and not consumer-facing credit advice. Only
 * the lender assesses the loan. `MATCH_DISCLAIMER` is rendered on every surface
 * that shows a result.
 */

import { computeCapacity, type CapacityInputs } from "../finance/capacity";
import type { BoolFact, IncomeTypeRule, LenderPolicy, ResidencyRule } from "./types";
import { coverageScore, matchableValue, verifyPolicy } from "./verify";
import type { LenderScenario, ScenarioApplicant } from "./scenario";

export const MATCH_DISCLAIMER =
  "Internal research aid for licensed brokers. Built from publicly published lender " +
  "policy documents, which change without notice and are summarised here imperfectly. " +
  "This is not a credit assessment, a pre-approval, or credit advice, and it must not " +
  "be shown to or relied on by a client. Confirm every result against the lender's " +
  "current policy before acting on it.";

// ─── Check vocabulary ───────────────────────────────────────────────────────

export const CHECK_OUTCOMES = ["pass", "fail", "refer", "unknown"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];

export const CHECK_CODES = [
  "max_lvr",
  "cash_out_lvr",
  "min_loan",
  "max_loan",
  "loan_term",
  "genuine_savings",
  "gifted_deposit",
  "employment_tenure",
  "probation",
  "self_employed_history",
  "income_type",
  "credit_defaults",
  "credit_judgments",
  "credit_bankruptcy",
  "credit_arrears",
  "credit_score",
  "unit_size",
  "high_density",
  "rural_security",
  "property_type",
  "residency",
  "dti",
  "servicing",
  "smsf",
  "construction",
  "age_at_maturity",
] as const;
export type CheckCode = (typeof CHECK_CODES)[number];

export type PolicyCheck = {
  code: CheckCode;
  /** Short human label, e.g. "Maximum LVR". */
  label: string;
  outcome: CheckOutcome;
  /** One sentence a broker can read aloud. Always populated. */
  reason: string;
  /** The lender's published value this was judged against, if any. */
  policyValue?: string | null;
  /** The client's value. */
  scenarioValue?: string | null;
  /** Provenance for the policy value — the whole point of the database. */
  sourceUrl?: string | null;
  asAt?: string | null;
};

export const MATCH_OUTCOMES = ["eligible", "refer", "ineligible", "insufficient_data"] as const;
export type MatchOutcome = (typeof MATCH_OUTCOMES)[number];

export const MATCH_OUTCOME_LABELS: Record<MatchOutcome, string> = {
  eligible: "Fits published policy",
  refer: "Possible — needs an exception",
  ineligible: "Ruled out by policy",
  insufficient_data: "Not enough policy data",
};

/**
 * Checks the engine only emits when the scenario actually carries that risk.
 * If one of these comes back `unknown`, we are missing policy on something
 * that specifically matters for THIS client — not a hypothetical.
 */
const RISK_TRIGGERED_CHECKS: readonly CheckCode[] = [
  "credit_defaults",
  "credit_judgments",
  "credit_bankruptcy",
  "credit_arrears",
  "credit_score",
  "residency",
  "unit_size",
  "high_density",
  "rural_security",
  "property_type",
  "gifted_deposit",
  "smsf",
  "construction",
  "cash_out_lvr",
];

/** Income types a mainstream lender assesses without special rules. */
const VANILLA_INCOME_TYPES = new Set([
  "payg_permanent_full_time",
  "payg_permanent_part_time",
]);

/**
 * Is this `unknown` check a MATERIAL gap for this scenario?
 *
 * The distinction that stops the shortlist lying. Without it, a lender whose
 * record holds three facts — max LVR, minimum loan, loan term — passes all
 * three and is reported as "Fits published policy", even for a casual worker
 * with two defaults whose casual-income and default policy we have never read.
 * Three passes out of twenty-five dimensions is not a fit; it is an untested
 * hypothesis wearing a green badge.
 *
 * So a gap counts as material when it lands on a dimension where this
 * particular client is NOT the vanilla case. A clean PAYG citizen buying a
 * house at 80% LVR genuinely is well served by an LVR-and-loan-size check;
 * the same check tells you nothing about a self-employed applicant on a visa.
 */
function isMaterialGap(check: PolicyCheck, scenario: LenderScenario, lvr: number | null): boolean {
  if (RISK_TRIGGERED_CHECKS.includes(check.code)) return true;

  if (check.code === "max_lvr") return lvr !== null && lvr > 80;

  if (check.code === "income_type") {
    return scenario.applicants.some((a) =>
      (a.incomeTypes ?? []).some((t) => !VANILLA_INCOME_TYPES.has(t)),
    );
  }

  if (
    check.code === "employment_tenure" ||
    check.code === "probation" ||
    check.code === "self_employed_history"
  ) {
    return scenario.applicants.some(
      (a) =>
        a.employmentBasis !== "permanent_full_time" &&
        a.employmentBasis !== "permanent_part_time",
    ) ||
      scenario.applicants.some(
        (a) => typeof a.monthsInCurrentRole === "number" && a.monthsInCurrentRole < 12,
      );
  }

  if (check.code === "genuine_savings") return lvr !== null && lvr > 80;

  return false;
}

export type LenderMatch = {
  lenderId: string;
  lenderName: string;
  tier: LenderPolicy["tier"];
  outcome: MatchOutcome;
  checks: PolicyCheck[];
  /** Only the knock-outs, for the collapsed row. */
  failures: PolicyCheck[];
  referrals: PolicyCheck[];
  unknowns: PolicyCheck[];
  /**
   * The subset of `unknowns` that lands on a dimension where this client is
   * not the vanilla case — i.e. the gaps that stop this being a real fit.
   * Surfaced so the UI can say WHICH policy we're missing, not just that the
   * record is thin.
   */
  materialGaps: PolicyCheck[];
  /** Indicative maximum loan under THIS lender's servicing parameters. */
  estimatedMaxLoan: number | null;
  /** Which of servicing / DTI / LVR / lender max bound the number. */
  bindingConstraint: string | null;
  /** Which lender parameters were actually available; the rest fall back to
   *  the generic defaults, which is disclosed rather than hidden. */
  parametersUsed: LenderServicingParams;
  /** 0–1 share of researched facts that passed verification. */
  dataQuality: number;
  /** How many facts survived verification. Ratio alone hides a one-fact record. */
  verifiedFieldCount: number;
  /** Ranking score. Higher is better. */
  score: number;
};

// ─── Per-lender servicing parameters ────────────────────────────────────────

export type LenderServicingParams = {
  buffer: number | null;
  floorRate: number | null;
  rentShading: number | null;
  dtiCap: number | null;
  creditCardRate: number | null;
  hemLoading: number | null;
  /** Field paths that fell back to the generic default. */
  fellBackTo: string[];
};

/**
 * Pull the servicing parameters, taking ONLY verified facts. Anything missing
 * is reported in `fellBackTo` so the UI can say "assessed on generic
 * assumptions" instead of implying the number is the lender's.
 */
export function servicingParams(
  policy: LenderPolicy,
  today: string,
): LenderServicingParams {
  const s = policy.servicing ?? {};
  const fellBackTo: string[] = [];
  const take = <T>(fact: Parameters<typeof matchableValue<T>>[0], path: string): T | null => {
    const v = matchableValue<T>(fact, path, today);
    if (v === null) fellBackTo.push(path);
    return v;
  };
  return {
    buffer: take<number>(s.assessmentBufferPct, "servicing.assessmentBufferPct"),
    floorRate: take<number>(s.assessmentFloorRatePct, "servicing.assessmentFloorRatePct"),
    rentShading: take<number>(s.rentShadingPct, "servicing.rentShadingPct"),
    dtiCap: take<number>(s.dtiCap, "servicing.dtiCap"),
    creditCardRate: take<number>(s.creditCardAssessmentPct, "servicing.creditCardAssessmentPct"),
    hemLoading: take<number>(s.hemLoadingPct, "servicing.hemLoadingPct"),
    fellBackTo,
  };
}

/** Overlay the lender's parameters onto the scenario's capacity inputs. */
export function applyLenderParams(
  base: CapacityInputs,
  p: LenderServicingParams,
): CapacityInputs {
  return {
    ...base,
    buffer: p.buffer ?? base.buffer,
    rentShading: p.rentShading ?? base.rentShading,
    dtiCap: p.dtiCap ?? base.dtiCap,
    creditCardAssessmentRate: p.creditCardRate ?? base.creditCardAssessmentRate,
    hemLoading: p.hemLoading ?? base.hemLoading,
    assessmentFloorRate: p.floorRate ?? base.assessmentFloorRate,
  };
}

// ─── Small helpers ──────────────────────────────────────────────────────────

function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${Math.round(n * 10) / 10}%`;
}
function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

/** Build a check from a fact, short-circuiting to `unknown` when unusable. */
function check(
  code: CheckCode,
  label: string,
  fact: { value: unknown; sourceUrl?: string | null; asAt?: string | null } | undefined,
  usable: unknown,
  evaluate: (value: never) => { outcome: CheckOutcome; reason: string; policyValue?: string; scenarioValue?: string },
): PolicyCheck {
  if (usable === null || usable === undefined) {
    return {
      code,
      label,
      outcome: "unknown",
      reason: `No verified ${label.toLowerCase()} policy on file for this lender.`,
      sourceUrl: fact?.sourceUrl ?? null,
      asAt: fact?.asAt ?? null,
    };
  }
  const r = evaluate(usable as never);
  return {
    code,
    label,
    outcome: r.outcome,
    reason: r.reason,
    policyValue: r.policyValue ?? null,
    scenarioValue: r.scenarioValue ?? null,
    sourceUrl: fact?.sourceUrl ?? null,
    asAt: fact?.asAt ?? null,
  };
}

/** An `unknown` check for something the SCENARIO doesn't carry. */
function needsInput(code: CheckCode, label: string, what: string): PolicyCheck {
  return {
    code,
    label,
    outcome: "unknown",
    reason: `Can't check — ${what} isn't recorded on the scenario.`,
  };
}

const isInvestment = (s: LenderScenario) => s.purpose === "purchase_investment";

/** The income types each employment basis implies, for the income-rule check. */
function impliedIncomeTypes(a: ScenarioApplicant): string[] {
  return a.incomeTypes ?? [];
}

// ─── The checks ─────────────────────────────────────────────────────────────

export function runChecks(
  policy: LenderPolicy,
  scenario: LenderScenario,
  today: string,
  estimated: { maxLoan: number | null; lvr: number | null },
): PolicyCheck[] {
  const checks: PolicyCheck[] = [];
  const v = <T>(fact: Parameters<typeof matchableValue<T>>[0], path: string) =>
    matchableValue<T>(fact, path, today);

  const loan = scenario.loanAmount ?? estimated.maxLoan;
  const value = scenario.propertyValue;
  // When the broker has asked for a specific loan, the LVR to test is THEIRS.
  // `estimated.lvr` is already capped by this lender's own maximum, so using it
  // here would make every LVR check pass by construction — the cap would quietly
  // rewrite the request instead of rejecting it.
  const lvr =
    loan !== null && value !== null && value > 0
      ? (loan / value) * 100
      : estimated.lvr;

  // ── LVR ──────────────────────────────────────────────────────────────
  {
    const path = isInvestment(scenario)
      ? "lvr.maxLvrInvestmentPct"
      : "lvr.maxLvrOwnerOccupiedPct";
    const fact = isInvestment(scenario)
      ? policy.lvr?.maxLvrInvestmentPct
      : policy.lvr?.maxLvrOwnerOccupiedPct;
    const maxLvr = v<number>(fact, path);
    if (lvr === null) {
      checks.push(needsInput("max_lvr", "Maximum LVR", "a loan amount and property value"));
    } else {
      checks.push(
        check("max_lvr", "Maximum LVR", fact, maxLvr, (max: number) =>
          lvr <= max
            ? {
                outcome: "pass",
                reason: `Required LVR of ${pct(lvr)} is within the published maximum of ${pct(max)}.`,
                policyValue: pct(max),
                scenarioValue: pct(lvr),
              }
            : {
                outcome: "fail",
                reason: `Required LVR of ${pct(lvr)} exceeds the published maximum of ${pct(max)}.`,
                policyValue: pct(max),
                scenarioValue: pct(lvr),
              },
        ),
      );
    }

    if (scenario.purpose === "refinance_cash_out") {
      const f = policy.lvr?.maxLvrCashOutPct;
      const maxCashOut = v<number>(f, "lvr.maxLvrCashOutPct");
      if (lvr !== null) {
        checks.push(
          check("cash_out_lvr", "Cash-out LVR", f, maxCashOut, (max: number) =>
            lvr <= max
              ? { outcome: "pass", reason: `Cash-out at ${pct(lvr)} is within the ${pct(max)} ceiling.`, policyValue: pct(max) }
              : { outcome: "fail", reason: `Cash-out ceiling is ${pct(max)}; this needs ${pct(lvr)}.`, policyValue: pct(max) },
          ),
        );
      }
    }
  }

  // ── Loan size ────────────────────────────────────────────────────────
  {
    const fMin = policy.product?.minLoanAmount;
    const min = v<number>(fMin, "product.minLoanAmount");
    if (loan === null) {
      checks.push(needsInput("min_loan", "Minimum loan", "a loan amount"));
    } else {
      checks.push(
        check("min_loan", "Minimum loan", fMin, min, (m: number) =>
          loan >= m
            ? { outcome: "pass", reason: `${money(loan)} is above the ${money(m)} minimum.`, policyValue: money(m) }
            : { outcome: "fail", reason: `${money(loan)} is below this lender's ${money(m)} minimum loan.`, policyValue: money(m) },
        ),
      );
      const fMax = policy.product?.maxLoanAmount;
      const max = v<number>(fMax, "product.maxLoanAmount");
      checks.push(
        check("max_loan", "Maximum loan", fMax, max, (m: number) =>
          loan <= m
            ? { outcome: "pass", reason: `${money(loan)} is within the ${money(m)} maximum.`, policyValue: money(m) }
            : { outcome: "fail", reason: `${money(loan)} exceeds this lender's ${money(m)} maximum loan.`, policyValue: money(m) },
        ),
      );
    }
  }

  // ── Loan term ────────────────────────────────────────────────────────
  {
    const f = policy.product?.maxLoanTermYears;
    const max = v<number>(f, "product.maxLoanTermYears");
    checks.push(
      check("loan_term", "Loan term", f, max, (m: number) =>
        scenario.loanTermYears <= m
          ? { outcome: "pass", reason: `${scenario.loanTermYears}-year term is within the ${m}-year maximum.`, policyValue: `${m} yrs` }
          : { outcome: "fail", reason: `Maximum term is ${m} years; ${scenario.loanTermYears} requested.`, policyValue: `${m} yrs` },
      ),
    );
  }

  // ── Genuine savings ──────────────────────────────────────────────────
  {
    const fAbove = policy.product?.genuineSavingsRequiredAboveLvrPct;
    const above = v<number>(fAbove, "product.genuineSavingsRequiredAboveLvrPct");
    const fPct = policy.product?.genuineSavingsRequiredPct;
    const reqPct = v<number>(fPct, "product.genuineSavingsRequiredPct");
    const applies = above === null || lvr === null ? null : lvr > above;
    if (applies === false) {
      checks.push({
        code: "genuine_savings",
        label: "Genuine savings",
        outcome: "pass",
        reason: `Genuine savings are only required above ${pct(above)} LVR; this is ${pct(lvr)}.`,
        policyValue: `> ${pct(above)} LVR`,
        sourceUrl: fAbove?.sourceUrl ?? null,
        asAt: fAbove?.asAt ?? null,
      });
    } else if (applies === true && reqPct !== null && value !== null) {
      const required = value * reqPct;
      checks.push({
        code: "genuine_savings",
        label: "Genuine savings",
        outcome: scenario.genuineSavings >= required ? "pass" : "fail",
        reason:
          scenario.genuineSavings >= required
            ? `${money(scenario.genuineSavings)} of genuine savings meets the ${pct(reqPct * 100)} requirement (${money(required)}).`
            : `Needs ${money(required)} of genuine savings (${pct(reqPct * 100)} of value); ${money(scenario.genuineSavings)} evidenced.`,
        policyValue: `${pct(reqPct * 100)} of value`,
        scenarioValue: money(scenario.genuineSavings),
        sourceUrl: fPct?.sourceUrl ?? null,
        asAt: fPct?.asAt ?? null,
      });
    } else {
      checks.push({
        code: "genuine_savings",
        label: "Genuine savings",
        outcome: "unknown",
        reason: "No verified genuine-savings policy on file for this lender.",
        sourceUrl: fPct?.sourceUrl ?? fAbove?.sourceUrl ?? null,
      });
    }
  }

  // ── Gifted deposit ───────────────────────────────────────────────────
  if (scenario.giftedDeposit) {
    const f = policy.product?.giftedDepositAccepted;
    const ok = v<boolean>(f, "product.giftedDepositAccepted");
    checks.push(
      check("gifted_deposit", "Gifted deposit", f, ok, (accepted: boolean) =>
        accepted
          ? { outcome: "pass", reason: "Gifted deposits are accepted." }
          : { outcome: "fail", reason: "This lender does not accept a gifted deposit." },
      ),
    );
  }

  // ── Employment tenure ────────────────────────────────────────────────
  for (const a of scenario.applicants) {
    if (a.employmentBasis === "self_employed" || a.employmentBasis === "contractor_abn") {
      const f = policy.income?.selfEmployedMinYears;
      const min = v<number>(f, "income.selfEmployedMinYears");
      if (a.yearsFinancials === null || a.yearsFinancials === undefined) {
        checks.push(needsInput("self_employed_history", `${a.label} — self-employed history`, "years of financials"));
      } else {
        checks.push(
          check("self_employed_history", `${a.label} — self-employed history`, f, min, (m: number) =>
            (a.yearsFinancials ?? 0) >= m
              ? { outcome: "pass", reason: `${a.yearsFinancials} year(s) of financials meets the ${m}-year requirement.`, policyValue: `${m} yrs` }
              : { outcome: "fail", reason: `Requires ${m} year(s) of financials; ${a.yearsFinancials} available.`, policyValue: `${m} yrs` },
          ),
        );
      }
      continue;
    }

    if (a.employmentBasis === "probation") {
      const f = policy.employment?.probationAccepted;
      const ok = v<boolean>(f, "employment.probationAccepted");
      checks.push(
        check("probation", `${a.label} — probation`, f, ok, (accepted: boolean) =>
          accepted
            ? { outcome: "pass", reason: "Applicants on probation are accepted." }
            : { outcome: "fail", reason: "This lender does not lend to applicants on probation." },
        ),
      );
      continue;
    }

    const casual = a.employmentBasis === "casual";
    const f = casual ? policy.employment?.minMonthsCasual : policy.employment?.minMonthsCurrentJob;
    const path = casual ? "employment.minMonthsCasual" : "employment.minMonthsCurrentJob";
    const min = v<number>(f, path);
    const months = a.monthsInCurrentRole;
    if (months === null || months === undefined) {
      checks.push(needsInput("employment_tenure", `${a.label} — employment tenure`, "months in the current role"));
      continue;
    }
    checks.push(
      check("employment_tenure", `${a.label} — employment tenure`, f, min, (m: number) => {
        if (months >= m) {
          return { outcome: "pass", reason: `${months} months in role meets the ${m}-month minimum.`, policyValue: `${m} months`, scenarioValue: `${months} months` };
        }
        // Same-industry continuity is the standard exception, so a shortfall
        // with industry history is a REFER, not a knock-out.
        const industry = a.monthsInIndustry ?? 0;
        if (industry >= m) {
          return {
            outcome: "refer",
            reason: `${months} months in role is under the ${m}-month minimum, but ${industry} months of same-industry continuity may qualify for an exception.`,
            policyValue: `${m} months`,
            scenarioValue: `${months} months`,
          };
        }
        return { outcome: "fail", reason: `${months} months in role is under this lender's ${m}-month minimum.`, policyValue: `${m} months`, scenarioValue: `${months} months` };
      }),
    );
  }

  // ── Income types ─────────────────────────────────────────────────────
  {
    const f = policy.income?.rules;
    const rules = v<IncomeTypeRule[]>(f, "income.rules");
    const wanted = new Set(scenario.applicants.flatMap(impliedIncomeTypes));
    if (rules === null) {
      checks.push({
        code: "income_type",
        label: "Income types",
        outcome: "unknown",
        reason: "No verified income-type policy on file for this lender.",
        sourceUrl: f?.sourceUrl ?? null,
      });
    } else {
      for (const type of wanted) {
        const rule = rules.find((r) => r.type === type);
        if (!rule) {
          checks.push({
            code: "income_type",
            label: `Income — ${type.replace(/_/g, " ")}`,
            outcome: "unknown",
            reason: `This lender's policy on ${type.replace(/_/g, " ")} income isn't on file.`,
            sourceUrl: f?.sourceUrl ?? null,
            asAt: f?.asAt ?? null,
          });
          continue;
        }
        checks.push({
          code: "income_type",
          label: `Income — ${type.replace(/_/g, " ")}`,
          outcome: rule.accepted === true ? "pass" : rule.accepted === false ? "fail" : "unknown",
          reason:
            rule.accepted === true
              ? `Accepted${rule.shadingPct !== null && rule.shadingPct !== undefined && rule.shadingPct < 1 ? ` at ${Math.round(rule.shadingPct * 100)}%` : " in full"}.${rule.conditions ? ` ${rule.conditions}` : ""}`
              : rule.accepted === false
                ? `Not accepted as assessable income.${rule.conditions ? ` ${rule.conditions}` : ""}`
                : "Acceptance not established.",
          policyValue: rule.shadingPct !== null && rule.shadingPct !== undefined ? `${Math.round(rule.shadingPct * 100)}%` : null,
          sourceUrl: f?.sourceUrl ?? null,
          asAt: f?.asAt ?? null,
        });
      }
    }
  }

  // ── Credit history ───────────────────────────────────────────────────
  if (scenario.credit.defaultsCount > 0) {
    const fIgnore = policy.credit?.defaultIgnoredUnderAmount;
    const ignoreUnder = v<number>(fIgnore, "credit.defaultIgnoredUnderAmount");
    const belowThreshold =
      ignoreUnder !== null && scenario.credit.defaultsTotalAmount < ignoreUnder;

    if (belowThreshold) {
      checks.push({
        code: "credit_defaults",
        label: "Credit defaults",
        outcome: "pass",
        reason: `Defaults totalling ${money(scenario.credit.defaultsTotalAmount)} fall under this lender's ${money(ignoreUnder)} disregard threshold.`,
        policyValue: `< ${money(ignoreUnder)} disregarded`,
        sourceUrl: fIgnore?.sourceUrl ?? null,
        asAt: fIgnore?.asAt ?? null,
      });
    } else {
      const fPaid = scenario.credit.defaultsPaid
        ? policy.credit?.paidDefaultsAccepted
        : policy.credit?.unpaidDefaultsAccepted;
      const pathPaid = scenario.credit.defaultsPaid
        ? "credit.paidDefaultsAccepted"
        : "credit.unpaidDefaultsAccepted";
      const accepted = v<boolean>(fPaid, pathPaid);
      checks.push(
        check("credit_defaults", "Credit defaults", fPaid, accepted, (ok: boolean) =>
          ok
            ? {
                outcome: "refer",
                reason: `${scenario.credit.defaultsCount} ${scenario.credit.defaultsPaid ? "paid" : "unpaid"} default(s) totalling ${money(scenario.credit.defaultsTotalAmount)} — acceptable in principle, expect scrutiny.`,
              }
            : {
                outcome: "fail",
                reason: `This lender does not accept ${scenario.credit.defaultsPaid ? "paid" : "unpaid"} defaults.`,
              },
        ),
      );
    }
  }

  if (scenario.credit.judgments) {
    const f = policy.credit?.judgmentsAccepted;
    const ok = v<boolean>(f, "credit.judgmentsAccepted");
    checks.push(
      check("credit_judgments", "Court judgments", f, ok, (accepted: boolean) =>
        accepted
          ? { outcome: "refer", reason: "Judgments may be considered — expect a full explanation to be required." }
          : { outcome: "fail", reason: "This lender declines applicants with court judgments." },
      ),
    );
  }

  if (scenario.credit.bankruptcyDischargedYears !== null && scenario.credit.bankruptcyDischargedYears !== undefined) {
    const f = policy.credit?.bankruptcyDischargedMinYears;
    const min = v<number>(f, "credit.bankruptcyDischargedMinYears");
    const yrs = scenario.credit.bankruptcyDischargedYears;
    checks.push(
      check("credit_bankruptcy", "Bankruptcy", f, min, (m: number) =>
        yrs >= m
          ? { outcome: "pass", reason: `Discharged ${yrs} year(s) ago, meeting the ${m}-year requirement.`, policyValue: `${m} yrs` }
          : { outcome: "fail", reason: `Requires ${m} year(s) since discharge; ${yrs} elapsed.`, policyValue: `${m} yrs` },
      ),
    );
  }

  if (scenario.credit.arrears12Months > 0) {
    const f = policy.credit?.maxArrears12Months;
    const max = v<number>(f, "credit.maxArrears12Months");
    checks.push(
      check("credit_arrears", "Repayment arrears", f, max, (m: number) =>
        scenario.credit.arrears12Months <= m
          ? { outcome: "pass", reason: `${scenario.credit.arrears12Months} missed repayment(s) in 12 months is within the ${m} allowed.`, policyValue: `${m}` }
          : { outcome: "fail", reason: `${scenario.credit.arrears12Months} missed repayments in 12 months exceeds the ${m} allowed.`, policyValue: `${m}` },
      ),
    );
  }

  if (scenario.credit.creditScore !== null && scenario.credit.creditScore !== undefined) {
    const f = policy.credit?.minCreditScore;
    const min = v<number>(f, "credit.minCreditScore");
    checks.push(
      check("credit_score", "Credit score", f, min, (m: number) =>
        (scenario.credit.creditScore ?? 0) >= m
          ? { outcome: "pass", reason: `Score of ${scenario.credit.creditScore} meets the ${m} minimum.`, policyValue: `${m}` }
          : { outcome: "fail", reason: `Score of ${scenario.credit.creditScore} is below the ${m} minimum.`, policyValue: `${m}` },
      ),
    );
  }

  // ── Security ─────────────────────────────────────────────────────────
  if (scenario.security.propertyType === "unit_apartment") {
    const f = policy.security?.minUnitFloorAreaSqm;
    const min = v<number>(f, "security.minUnitFloorAreaSqm");
    const area = scenario.security.floorAreaSqm;
    if (area === null || area === undefined) {
      checks.push(needsInput("unit_size", "Minimum unit size", "the unit's internal floor area"));
    } else {
      checks.push(
        check("unit_size", "Minimum unit size", f, min, (m: number) =>
          area >= m
            ? { outcome: "pass", reason: `${area}m² meets the ${m}m² minimum internal area.`, policyValue: `${m}m²`, scenarioValue: `${area}m²` }
            : { outcome: "fail", reason: `${area}m² is under this lender's ${m}m² minimum internal area.`, policyValue: `${m}m²`, scenarioValue: `${area}m²` },
        ),
      );
    }
  }

  if (scenario.security.highDensity) {
    const f = policy.security?.highDensityMaxLvrPct;
    const max = v<number>(f, "security.highDensityMaxLvrPct");
    if (lvr !== null) {
      checks.push(
        check("high_density", "High-density apartment", f, max, (m: number) =>
          lvr <= m
            ? { outcome: "pass", reason: `High-density LVR cap is ${pct(m)}; this needs ${pct(lvr)}.`, policyValue: pct(m) }
            : { outcome: "fail", reason: `High-density security is capped at ${pct(m)} LVR; this needs ${pct(lvr)}.`, policyValue: pct(m) },
        ),
      );
    }
  }

  if (scenario.security.propertyType === "rural_residential" || scenario.security.propertyType === "acreage") {
    const f = policy.security?.ruralResidentialAccepted;
    const ok = v<boolean>(f, "security.ruralResidentialAccepted");
    checks.push(
      check("rural_security", "Rural security", f, ok, (accepted: boolean) =>
        accepted
          ? { outcome: "pass", reason: "Rural residential security is accepted." }
          : { outcome: "fail", reason: "This lender does not accept rural residential security." },
      ),
    );
  }

  {
    const map: Partial<Record<string, { fact: unknown; path: string; label: string }>> = {
      company_title: { fact: policy.security?.companyTitleAccepted, path: "security.companyTitleAccepted", label: "Company title" },
      serviced_apartment: { fact: policy.security?.servicedApartmentAccepted, path: "security.servicedApartmentAccepted", label: "Serviced apartment" },
      student_accommodation: { fact: policy.security?.studentAccommodationAccepted, path: "security.studentAccommodationAccepted", label: "Student accommodation" },
      display_home_leaseback: { fact: policy.security?.displayHomeLeasebackAccepted, path: "security.displayHomeLeasebackAccepted", label: "Display home leaseback" },
      nras: { fact: policy.security?.nrasAccepted, path: "security.nrasAccepted", label: "NRAS property" },
      sda_ndis: { fact: policy.security?.sdaNdisAccepted, path: "security.sdaNdisAccepted", label: "SDA / NDIS housing" },
    };
    const entry = map[scenario.security.propertyType];
    if (entry) {
      const fact = (entry.fact ?? undefined) as BoolFact | undefined;
      const ok = v<boolean>(fact, entry.path);
      checks.push(
        check("property_type", entry.label, fact, ok, (accepted: boolean) =>
          accepted
            ? { outcome: "pass", reason: `${entry.label} is acceptable security.` }
            : { outcome: "fail", reason: `${entry.label} is not acceptable security for this lender.` },
        ),
      );
    }
  }

  // ── Residency ────────────────────────────────────────────────────────
  {
    const f = policy.residency?.rules;
    const rules = v<ResidencyRule[]>(f, "residency.rules");
    for (const a of scenario.applicants) {
      if (a.residency === "australian_citizen" || a.residency === "permanent_resident") continue;
      if (rules === null) {
        checks.push({
          code: "residency",
          label: `${a.label} — residency`,
          outcome: "unknown",
          reason: "No verified residency/visa policy on file for this lender.",
          sourceUrl: f?.sourceUrl ?? null,
        });
        continue;
      }
      const rule = rules.find((r) => r.status === a.residency);
      checks.push({
        code: "residency",
        label: `${a.label} — residency`,
        outcome: !rule ? "unknown" : rule.accepted === true ? "pass" : rule.accepted === false ? "fail" : "unknown",
        reason: !rule
          ? `This lender's policy for ${a.residency.replace(/_/g, " ")} applicants isn't on file.`
          : rule.accepted
            ? `Accepted${rule.maxLvrPct ? ` to ${pct(rule.maxLvrPct)} LVR` : ""}.${rule.conditions ? ` ${rule.conditions}` : ""}`
            : `Not accepted.${rule.conditions ? ` ${rule.conditions}` : ""}`,
        policyValue: rule?.maxLvrPct ? pct(rule.maxLvrPct) : null,
        sourceUrl: f?.sourceUrl ?? null,
        asAt: f?.asAt ?? null,
      });
    }
  }

  // ── SMSF / construction availability ─────────────────────────────────
  if (scenario.purpose === "smsf") {
    const f = policy.product?.smsfLendingAvailable;
    const ok = v<boolean>(f, "product.smsfLendingAvailable");
    checks.push(
      check("smsf", "SMSF lending", f, ok, (available: boolean) =>
        available
          ? { outcome: "pass", reason: "SMSF lending is offered." }
          : { outcome: "fail", reason: "This lender does not offer SMSF lending." },
      ),
    );
  }
  if (scenario.purpose === "construction") {
    const f = policy.product?.constructionAvailable;
    const ok = v<boolean>(f, "product.constructionAvailable");
    checks.push(
      check("construction", "Construction lending", f, ok, (available: boolean) =>
        available
          ? { outcome: "pass", reason: "Construction lending is offered." }
          : { outcome: "fail", reason: "This lender does not offer construction lending." },
      ),
    );
  }

  // ── Age at maturity ──────────────────────────────────────────────────
  {
    const f = policy.product?.maxAgeAtMaturity;
    const max = v<number>(f, "product.maxAgeAtMaturity");
    const ages = scenario.applicants.map((a) => a.age).filter((n): n is number => typeof n === "number");
    if (max !== null && ages.length > 0) {
      const oldestAtMaturity = Math.max(...ages) + scenario.loanTermYears;
      checks.push({
        code: "age_at_maturity",
        label: "Age at maturity",
        outcome: oldestAtMaturity <= max ? "pass" : "refer",
        reason:
          oldestAtMaturity <= max
            ? `Oldest applicant reaches ${oldestAtMaturity} at maturity, within the ${max} limit.`
            : `Oldest applicant reaches ${oldestAtMaturity} at maturity, over the ${max} limit — an exit strategy will be required.`,
        policyValue: `${max}`,
        scenarioValue: `${oldestAtMaturity}`,
        sourceUrl: f?.sourceUrl ?? null,
        asAt: f?.asAt ?? null,
      });
    }
  }

  return checks;
}

// ─── Max loan estimate ──────────────────────────────────────────────────────

export type LoanEstimate = {
  maxLoan: number | null;
  lvr: number | null;
  bindingConstraint: string | null;
};

/**
 * What this lender would probably lend, using its own servicing parameters.
 *
 * Caps the servicing/DTI answer by the lender's published maximum loan and by
 * its maximum LVR against the known property value — the smallest of the three
 * is the answer, and which one bound it is reported so a broker can see
 * whether the client is income-constrained or deposit-constrained.
 */
export function estimateMaxLoan(
  policy: LenderPolicy,
  scenario: LenderScenario,
  params: LenderServicingParams,
  today: string,
): LoanEstimate {
  const inputs = applyLenderParams(scenario.capacity, params);
  let maxLoan: number;
  let binding: string;
  try {
    const result = computeCapacity(inputs);
    maxLoan = result.maxLoan;
    binding = result.bindingConstraint;
  } catch {
    return { maxLoan: null, lvr: null, bindingConstraint: null };
  }

  const lenderMax = matchableValue<number>(policy.product?.maxLoanAmount, "product.maxLoanAmount", today);
  if (lenderMax !== null && lenderMax < maxLoan) {
    maxLoan = lenderMax;
    binding = "lender maximum";
  }

  const maxLvrPath = isInvestment(scenario) ? "lvr.maxLvrInvestmentPct" : "lvr.maxLvrOwnerOccupiedPct";
  const maxLvrFact = isInvestment(scenario) ? policy.lvr?.maxLvrInvestmentPct : policy.lvr?.maxLvrOwnerOccupiedPct;
  const maxLvr = matchableValue<number>(maxLvrFact, maxLvrPath, today);
  const value = scenario.propertyValue;
  if (maxLvr !== null && value !== null && value > 0) {
    const lvrCap = value * (maxLvr / 100);
    if (lvrCap < maxLoan) {
      maxLoan = lvrCap;
      binding = "maximum LVR";
    }
  }

  const lvr = value !== null && value > 0 ? (maxLoan / value) * 100 : null;
  return { maxLoan: Math.max(0, Math.round(maxLoan)), lvr, bindingConstraint: binding };
}

// ─── Putting it together ────────────────────────────────────────────────────

/** Weight of each outcome in the ranking score. */
const OUTCOME_WEIGHT: Record<CheckOutcome, number> = {
  pass: 1,
  refer: -3,
  fail: -100,
  unknown: -0.5,
};

export function matchLender(
  rawPolicy: LenderPolicy,
  scenario: LenderScenario,
  today: string,
): LenderMatch {
  // Re-verify rather than trusting the stored status — a fact can go stale
  // between the research pass and the moment a broker runs the shortlist.
  const { policy, counts } = verifyPolicy(rawPolicy, today);
  const params = servicingParams(policy, today);
  const estimate = estimateMaxLoan(policy, scenario, params, today);
  const checks = runChecks(policy, scenario, today, estimate);

  const failures = checks.filter((c) => c.outcome === "fail");
  const referrals = checks.filter((c) => c.outcome === "refer");
  const unknowns = checks.filter((c) => c.outcome === "unknown");
  const passes = checks.filter((c) => c.outcome === "pass");

  // Gaps that land on a dimension where THIS client is not the vanilla case.
  // See isMaterialGap — these are what separate "we checked and it fits" from
  // "we checked the two things we happen to know".
  const loanForLvr = scenario.loanAmount ?? estimate.maxLoan;
  const lvrForGaps =
    loanForLvr !== null && scenario.propertyValue !== null && scenario.propertyValue > 0
      ? (loanForLvr / scenario.propertyValue) * 100
      : estimate.lvr;
  const materialGaps = unknowns.filter((c) => isMaterialGap(c, scenario, lvrForGaps));

  let outcome: MatchOutcome;
  if (failures.length > 0) outcome = "ineligible";
  else if (referrals.length > 0) outcome = "refer";
  // A lender we know nothing useful about is NOT "eligible" — it's a gap.
  // Requiring at least one real pass is what stops an empty policy record
  // sailing to the top of the shortlist.
  else if (passes.length === 0) outcome = "insufficient_data";
  // ...and neither is one we couldn't check on something that actually
  // matters for this client. Saying "fits published policy" about a lender
  // whose casual-income rules we have never read is the single most damaging
  // thing this tool could do.
  else if (materialGaps.length > 0) outcome = "insufficient_data";
  else outcome = "eligible";

  const dataQuality = coverageScore(counts);
  const checkScore = checks.reduce((s, c) => s + OUTCOME_WEIGHT[c.outcome], 0);
  // Loan size dominates ranking among lenders that all pass — that is the
  // question a broker is actually asking — with data quality as the tiebreak
  // so a well-evidenced record beats a barely-researched one.
  //
  // Quality is two things, and both are needed: the RATIO of researched facts
  // that survived verification, and the VOLUME of them. Ratio alone ranks a
  // lender with one verified fact equal to one with forty (both score 1.0),
  // which is exactly backwards for a shortlist a broker has to defend.
  const verifiedCount = counts.verified + counts.humanConfirmed;
  const loanScore = estimate.maxLoan ? estimate.maxLoan / 100_000 : 0;
  const score =
    outcome === "ineligible"
      ? checkScore
      : checkScore +
        loanScore +
        dataQuality * 5 +
        Math.min(verifiedCount, 40) * 0.1 +
        (outcome === "eligible" ? 20 : 0);

  return {
    lenderId: policy.id,
    lenderName: policy.name,
    tier: policy.tier,
    outcome,
    checks,
    failures,
    referrals,
    unknowns,
    materialGaps,
    estimatedMaxLoan: estimate.maxLoan,
    bindingConstraint: estimate.bindingConstraint,
    parametersUsed: params,
    dataQuality,
    verifiedFieldCount: verifiedCount,
    score,
  };
}

export type MatchRun = {
  matches: LenderMatch[];
  /** Counts by outcome, for the summary line. */
  summary: Record<MatchOutcome, number>;
  /** Scenario-side gaps that limited what could be checked. */
  scenarioGaps: string[];
  disclaimer: string;
  runAt: string;
};

const OUTCOME_ORDER: Record<MatchOutcome, number> = {
  eligible: 0,
  refer: 1,
  insufficient_data: 2,
  ineligible: 3,
};

export function matchScenario(
  policies: LenderPolicy[],
  scenario: LenderScenario,
  today: string,
  gaps: string[] = [],
): MatchRun {
  const matches = policies
    .map((p) => matchLender(p, scenario, today))
    .sort((a, b) => {
      const byOutcome = OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome];
      if (byOutcome !== 0) return byOutcome;
      if (b.score !== a.score) return b.score - a.score;
      return a.lenderName.localeCompare(b.lenderName);
    });

  const summary: Record<MatchOutcome, number> = {
    eligible: 0,
    refer: 0,
    ineligible: 0,
    insufficient_data: 0,
  };
  for (const m of matches) summary[m.outcome] += 1;

  return { matches, summary, scenarioGaps: gaps, disclaimer: MATCH_DISCLAIMER, runAt: today };
}
