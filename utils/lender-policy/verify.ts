/**
 * Fact verification — the gate between "an AI wrote a number down" and "the
 * matching engine is allowed to act on it".
 *
 * Pure and side-effect free (vitest: `verify.test.ts`). Deliberately separate
 * from the network check (`checkSourceUrl` in `source-check.ts`) so the rules
 * are testable without hitting the internet.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 * The research pipeline is a language model reading lender websites. Language
 * models are excellent at producing a plausible assessment buffer and terrible
 * at knowing they invented it. The failure mode is not "the database is empty"
 * — it is "the database is confidently wrong", which produces a broker
 * recommending a lender that will decline the client. So every fact must clear
 * four independent hurdles before it can influence a recommendation:
 *
 *   1. PROVENANCE  — a source URL and an as-at date. No exceptions.
 *   2. SHAPE       — the URL is a real absolute http(s) URL, the date parses.
 *   3. PLAUSIBILITY— the value sits inside a range a real lender could publish.
 *                    A 47% assessment buffer is a misread, not a policy.
 *   4. CONFIDENCE  — the researcher's own `low` is taken at its word.
 *
 * Anything that fails is not deleted — it is DEMOTED to `unverified` with the
 * reason attached, stays visible in the reference UI (a broker can still read
 * it and judge for themselves), and is excluded from automated matching.
 *
 * `human_confirmed` is the one status that bypasses plausibility and
 * confidence: a broker who has the actual policy document in front of them
 * outranks any heuristic here. It still needs provenance.
 */

import type { Confidence, Fact, FactStatus, LenderPolicy } from "./types";
import { MATCHABLE_STATUSES } from "./types";

// ─── Plausibility ranges ────────────────────────────────────────────────────

/**
 * Inclusive [min, max] a real published value could fall in. Keyed by the
 * dotted path of the field within a `LenderPolicy`.
 *
 * These are wide on purpose — the job is to catch a decimal-point slip or a
 * percentage read as a fraction, NOT to enforce what we think policy should
 * be. A range that rejects a genuine outlier makes the database wrong in the
 * other direction, so when in doubt the range is loosened and the note carries
 * the quote.
 */
export const PLAUSIBLE_RANGES: Record<string, [number, number]> = {
  "servicing.assessmentBufferPct": [0.5, 4],
  "servicing.assessmentFloorRatePct": [4, 12],
  "servicing.refinanceBufferPct": [0, 4],
  "servicing.rentShadingPct": [0.6, 1],
  "servicing.creditCardAssessmentPct": [0.02, 0.05],
  "servicing.hemLoadingPct": [1, 2],
  "servicing.dtiCap": [4, 12],
  "servicing.dtiReferThreshold": [4, 12],
  "servicing.ioResidualTermYears": [10, 30],

  "lvr.maxLvrOwnerOccupiedPct": [50, 105],
  "lvr.maxLvrInvestmentPct": [50, 105],
  "lvr.maxLvrNoLmiPct": [50, 100],
  "lvr.maxLvrCashOutPct": [50, 100],
  "lvr.maxLvrConstructionPct": [50, 105],
  "lvr.maxLvrRefinancePct": [50, 105],
  "lvr.maxLvrCompanyTrustPct": [50, 100],
  "lvr.lmiWaiverMaxLvrPct": [70, 100],

  "income.altDocMaxLvrPct": [50, 90],
  "income.selfEmployedMinYears": [0, 5],

  "employment.minMonthsCurrentJob": [0, 60],
  "employment.minMonthsSameIndustry": [0, 60],
  "employment.minMonthsCasual": [0, 60],
  "employment.minMonthsContract": [0, 60],
  "employment.minContractRemainingMonths": [0, 60],
  "employment.minMonthsSelfEmployedAbn": [0, 60],
  "employment.minMonthsGstRegistered": [0, 60],
  "employment.maxEmploymentGapMonths": [0, 60],

  "credit.maxDefaults": [0, 20],
  "credit.defaultIgnoredUnderAmount": [0, 10000],
  "credit.paidDefaultMinAgeMonths": [0, 84],
  "credit.bankruptcyDischargedMinYears": [0, 15],
  "credit.partIxDischargedMinYears": [0, 15],
  "credit.maxArrears6Months": [0, 12],
  "credit.maxArrears12Months": [0, 24],
  "credit.minCreditScore": [0, 1200],
  "credit.maxEnquiries6Months": [0, 30],

  "security.minUnitFloorAreaSqm": [15, 100],
  "security.maxLandSizeHa": [0.1, 100],
  "security.restrictedPostcodeMaxLvrPct": [30, 95],
  "security.highDensityMaxLvrPct": [30, 95],
  "security.ruralMaxLvrPct": [30, 95],
  "security.maxSecurities": [1, 50],

  "product.minLoanAmount": [10000, 500000],
  "product.maxLoanAmount": [100000, 100000000],
  "product.maxLoanTermYears": [10, 40],
  "product.maxInterestOnlyYearsOwnerOcc": [0, 15],
  "product.maxInterestOnlyYearsInvestment": [0, 20],
  "product.genuineSavingsRequiredPct": [0, 0.25],
  "product.genuineSavingsRequiredAboveLvrPct": [50, 100],
  "product.genuineSavingsMinMonths": [0, 24],
  "product.maxAgeAtMaturity": [55, 100],
  "product.exitStrategyRequiredOverAge": [40, 80],

  "residency.foreignIncomeShadingPct": [0, 1],
};

/** Confidence levels the engine will act on. `low` never matches. */
export const ACTIONABLE_CONFIDENCE: readonly Confidence[] = ["high", "medium"];

// ─── Shape checks ───────────────────────────────────────────────────────────

/** A resolvable-looking absolute http(s) URL. Not a network check. */
export function looksLikeSourceUrl(url: unknown): url is string {
  if (typeof url !== "string" || url.trim() === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  // A bare origin is where you START looking, not where you read a number.
  // Requiring a path or a query keeps "https://www.cba.com.au/" out.
  const hasPath = parsed.pathname.replace(/\/+$/, "") !== "";
  return hasPath || parsed.search !== "";
}

/** A real calendar date in 'YYYY-MM-DD'. Rejects 2026-02-31. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return (
    dt.getUTCFullYear() === Number(y) &&
    dt.getUTCMonth() === Number(mo) - 1 &&
    dt.getUTCDate() === Number(d)
  );
}

/** How stale a sourced policy fact may be before it stops being matchable. */
export const MAX_FACT_AGE_DAYS = 730; // two years

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// ─── The verdict ────────────────────────────────────────────────────────────

export type VerificationIssue =
  | "missing_source_url"
  | "malformed_source_url"
  | "missing_as_at"
  | "malformed_as_at"
  | "as_at_in_future"
  | "stale"
  | "out_of_range"
  | "low_confidence"
  | "empty_value";

export const ISSUE_LABELS: Record<VerificationIssue, string> = {
  missing_source_url: "No source URL",
  malformed_source_url: "Source URL is not a usable page link",
  missing_as_at: "No as-at date",
  malformed_as_at: "As-at date is not a valid YYYY-MM-DD date",
  as_at_in_future: "As-at date is in the future",
  stale: "Source is more than two years old",
  out_of_range: "Value is outside the plausible range for this field",
  low_confidence: "Researcher recorded low confidence",
  empty_value: "No value recorded",
};

export type FactVerdict = {
  status: FactStatus;
  /** Can the matching engine rely on this value? */
  matchable: boolean;
  issues: VerificationIssue[];
};

/**
 * Decide what a single fact is worth.
 *
 * `today` is injected rather than read from the clock so this stays pure and
 * the tests don't rot. Callers pass `brisbaneToday()`.
 */
export function verifyFact<T>(
  fact: Fact<T> | undefined | null,
  opts: { path?: string; today: string },
): FactVerdict {
  if (!fact) return { status: "not_found", matchable: false, issues: ["empty_value"] };

  const issues: VerificationIssue[] = [];

  // An explicit "we looked and it isn't published" is a legitimate terminal
  // state, not a failure to be re-litigated.
  if (fact.status === "not_found") {
    return { status: "not_found", matchable: false, issues: [] };
  }

  if (fact.value === null || fact.value === undefined) issues.push("empty_value");
  if (Array.isArray(fact.value) && fact.value.length === 0) issues.push("empty_value");

  // 1 + 2. Provenance and its shape. Non-negotiable for every status,
  // including human_confirmed — a broker's word still needs a document.
  if (!fact.sourceUrl) issues.push("missing_source_url");
  else if (!looksLikeSourceUrl(fact.sourceUrl)) issues.push("malformed_source_url");

  if (!fact.asAt) issues.push("missing_as_at");
  else if (!isIsoDate(fact.asAt)) issues.push("malformed_as_at");
  else if (daysBetween(fact.asAt, opts.today) < 0) issues.push("as_at_in_future");
  else if (daysBetween(fact.asAt, opts.today) > MAX_FACT_AGE_DAYS) issues.push("stale");

  // 3 + 4. A human who checked the policy document outranks both heuristics.
  if (fact.status !== "human_confirmed") {
    const range = opts.path ? PLAUSIBLE_RANGES[opts.path] : undefined;
    if (range && typeof fact.value === "number") {
      if (!Number.isFinite(fact.value) || fact.value < range[0] || fact.value > range[1]) {
        issues.push("out_of_range");
      }
    }
    if (!ACTIONABLE_CONFIDENCE.includes(fact.confidence)) issues.push("low_confidence");
  }

  if (issues.length > 0) {
    return { status: "unverified", matchable: false, issues };
  }

  const status: FactStatus = fact.status === "human_confirmed" ? "human_confirmed" : "verified";
  return { status, matchable: MATCHABLE_STATUSES.includes(status), issues: [] };
}

/**
 * Re-stamp every fact on a policy with its verified status.
 *
 * Returns a NEW policy — the researcher's `status` claim is overwritten by the
 * verdict, which is the point: a research agent supplies evidence, it does not
 * grant itself clearance. Also returns a per-path issue map for the UI and a
 * coverage count for ranking data quality.
 */
export type PolicyVerification = {
  policy: LenderPolicy;
  issues: Record<string, VerificationIssue[]>;
  counts: {
    total: number;
    verified: number;
    humanConfirmed: number;
    unverified: number;
    notFound: number;
  };
};

const SECTION_KEYS = [
  "servicing",
  "lvr",
  "income",
  "employment",
  "credit",
  "security",
  "product",
  "residency",
] as const;

function isFactLike(v: unknown): v is Fact<unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    "confidence" in (v as Record<string, unknown>) &&
    "status" in (v as Record<string, unknown>)
  );
}

export function verifyPolicy(policy: LenderPolicy, today: string): PolicyVerification {
  const issues: Record<string, VerificationIssue[]> = {};
  const counts = { total: 0, verified: 0, humanConfirmed: 0, unverified: 0, notFound: 0 };

  // Shallow clone per section — facts are replaced wholesale, never mutated.
  const next = { ...policy } as unknown as Record<string, unknown>;

  for (const section of SECTION_KEYS) {
    const original = (policy[section] ?? {}) as Record<string, unknown>;
    const rebuilt: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(original)) {
      if (!isFactLike(value)) {
        rebuilt[field] = value;
        continue;
      }
      const path = `${section}.${field}`;
      const verdict = verifyFact(value, { path, today });
      counts.total += 1;
      if (verdict.status === "verified") counts.verified += 1;
      else if (verdict.status === "human_confirmed") counts.humanConfirmed += 1;
      else if (verdict.status === "not_found") counts.notFound += 1;
      else counts.unverified += 1;
      if (verdict.issues.length > 0) issues[path] = verdict.issues;
      rebuilt[field] = { ...value, status: verdict.status };
    }
    next[section] = rebuilt;
  }

  return { policy: next as unknown as LenderPolicy, issues, counts };
}

/** The value, but only if the engine is allowed to use it. Otherwise null. */
export function matchableValue<T>(
  fact: Fact<T> | undefined | null,
  path: string,
  today: string,
): T | null {
  if (!fact) return null;
  const verdict = verifyFact(fact, { path, today });
  if (!verdict.matchable) return null;
  return fact.value ?? null;
}

/**
 * Share of researched fields that survived verification, 0–1.
 * Drives the "data quality" badge and breaks ties in the shortlist ranking —
 * between two lenders that both pass, prefer the one we actually know about.
 */
export function coverageScore(counts: PolicyVerification["counts"]): number {
  if (counts.total === 0) return 0;
  return (counts.verified + counts.humanConfirmed) / counts.total;
}
