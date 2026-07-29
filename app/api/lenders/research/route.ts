import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { MODELS, orErrorMessage, orText } from "../../../../utils/openrouter";
import { brisbaneToday, hydratePolicy, policyFacts } from "../../../../utils/lender-policy";
import type { Fact, LenderPolicy } from "../../../../utils/lender-policy/types";
import { verifyFact, type VerificationIssue } from "../../../../utils/lender-policy/verify";
import { checkSourceUrls } from "../../../../utils/lender-policy/source-check";
import { loadPolicy, upsertPolicies } from "../../../../utils/lender-policy/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The research pipeline, single-lender edition.
 *
 * The bulk tranches are run by Claude Code subagents against
 * `docs/lender-policy-research-brief.md`; this route is the in-app refresh for
 * one lender, and it enforces the SAME contract in code rather than in a prompt.
 *
 * ── THE FOUR GATES ───────────────────────────────────────────────────────
 * A proposed fact is only accepted if it clears all four:
 *
 *   1. `verifyFact` — has a source URL and an as-at date, the value is in a
 *      plausible range, and confidence is not `low`.
 *   2. Live source check — the URL actually resolves. This is the gate a prompt
 *      cannot enforce and a shape check cannot catch: an invented policy fact
 *      usually arrives with an invented-but-plausible URL on the right domain.
 *   3. Domain sanity — the source is not an aggregator portal or a comparison
 *      site dressed up as the lender's own policy.
 *   4. Never auto-applied on its own say-so — `apply` must be requested
 *      explicitly, and even then only ACCEPTED fields are written.
 *
 * Everything rejected is returned with its reason and logged to
 * `lender_policy_research_runs.rejections`. If that log is ever empty run after
 * run, the gate has stopped working and should be suspected, not trusted.
 */

/** Sources that are not the lender's own published policy. */
const DISALLOWED_HOSTS = [
  "connective.com.au",
  "afgonline.com.au",
  "loanmarket.com.au",
  "lmg.broker",
  "mortgagechoice.com.au",
  "aussie.com.au",
  "finder.com.au",
  "canstar.com.au",
  "ratecity.com.au",
  "mozo.com.au",
  "infochoice.com.au",
  "wikipedia.org",
  "reddit.com",
  "facebook.com",
  "linkedin.com",
];

function hostDisallowed(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DISALLOWED_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
  } catch {
    return true;
  }
}

const SYSTEM = `You research Australian home-loan lender credit policy for a licensed mortgage broker's internal database.

SOURCES — public and no-login only: the lender's own broker/introducer site, published credit policy guides, rate and product schedules, LVR/LMI matrices, postcode category lists, serviceability calculator help text, and the lender's own product pages.
NEVER use: anything behind a broker login, aggregator portals (Connective, AFG, LMG, Loan Market), comparison sites (Finder, Canstar, RateCity, Mozo), Wikipedia, forums, or social media.

THE ABSOLUTE RULE: never state a number you did not read on a public source you can cite. Every value must carry the exact page URL it was read on (not the site root) and the date that page is current, as YYYY-MM-DD. If you cannot find a value, return it as {"value": null, "asAt": null, "sourceUrl": null, "confidence": "low", "status": "not_found", "note": "<where you looked>"} — or omit the field entirely. Do NOT infer a value from a similar lender, do NOT recall it from memory, and do NOT interpolate. An admitted gap is correct; a fabricated number produces a broker recommending a lender that will decline the client.

Confidence: "high" = the source states it explicitly; "medium" = stated with qualifiers you interpreted; "low" = inferred indirectly. Low-confidence values are rejected downstream, so do not use "high" to get a value through.

Return ONLY a JSON object, no prose and no code fence.`;

function userPrompt(lender: { id: string; name: string; brokerSiteUrl?: string | null }): string {
  return `Research the current published home-loan credit policy for: ${lender.name}${
    lender.brokerSiteUrl ? ` (broker site: ${lender.brokerSiteUrl})` : ""
  }.

Return this JSON shape. Every leaf is a "fact object": {"value": <value>, "asAt": "YYYY-MM-DD", "sourceUrl": "https://…/exact-page", "sourceTitle": "…", "confidence": "high|medium|low", "status": "verified", "note": null}

{
  "servicing": {
    "assessmentBufferPct": <fact, percentage points added to the product rate, e.g. 3>,
    "assessmentFloorRatePct": <fact, absolute assessment-rate floor %>,
    "rentShadingPct": <fact, FRACTION of gross rent counted, e.g. 0.8>,
    "creditCardAssessmentPct": <fact, monthly % of card limit as a FRACTION, e.g. 0.038>,
    "dtiCap": <fact, e.g. 6>,
    "negativeGearingAddBack": <fact, boolean>,
    "notes": <fact, string>
  },
  "lvr": {
    "maxLvrOwnerOccupiedPct": <fact>, "maxLvrInvestmentPct": <fact>,
    "maxLvrNoLmiPct": <fact>, "maxLvrCashOutPct": <fact>,
    "lmiWaiverProfessions": <fact, array of strings>, "lmiWaiverMaxLvrPct": <fact>
  },
  "income": {
    "rules": <fact whose value is an ARRAY of {"type": <one of: payg_permanent_full_time, payg_permanent_part_time, payg_probation, payg_casual, payg_fixed_term_contract, payg_contractor_abn, overtime_essential_services, overtime_other, bonus, commission, car_allowance, self_employed_sole_trader, self_employed_company, rental_residential, government_family_tax_benefit, government_age_pension, government_disability_support, child_support_maintenance, dividends, foreign_income, second_job>, "accepted": bool, "shadingPct": 0-1, "minHistoryMonths": n, "evidence": "…", "conditions": "…"}>,
    "selfEmployedMinYears": <fact>, "altDocAvailable": <fact, boolean>, "altDocMaxLvrPct": <fact>
  },
  "employment": {
    "minMonthsCurrentJob": <fact>, "minMonthsCasual": <fact>,
    "probationAccepted": <fact, boolean>, "minMonthsSelfEmployedAbn": <fact>
  },
  "credit": {
    "maxDefaults": <fact>, "defaultIgnoredUnderAmount": <fact>,
    "paidDefaultsAccepted": <fact, boolean>, "unpaidDefaultsAccepted": <fact, boolean>,
    "judgmentsAccepted": <fact, boolean>, "bankruptcyDischargedMinYears": <fact>
  },
  "security": {
    "minUnitFloorAreaSqm": <fact>, "postcodeListUrl": <fact, string>,
    "highDensityMaxLvrPct": <fact>, "ruralResidentialAccepted": <fact, boolean>,
    "companyTitleAccepted": <fact, boolean>, "servicedApartmentAccepted": <fact, boolean>
  },
  "product": {
    "minLoanAmount": <fact>, "maxLoanAmount": <fact>, "maxLoanTermYears": <fact>,
    "genuineSavingsRequiredPct": <fact, FRACTION e.g. 0.05>,
    "genuineSavingsRequiredAboveLvrPct": <fact>,
    "rentalLedgerAsGenuineSavings": <fact, boolean>, "giftedDepositAccepted": <fact, boolean>,
    "guarantorAccepted": <fact, boolean>, "smsfLendingAvailable": <fact, boolean>,
    "constructionAvailable": <fact, boolean>, "maxAgeAtMaturity": <fact>
  },
  "residency": {
    "rules": <fact whose value is an ARRAY of {"status": <one of: nz_citizen_444, temporary_visa_work, temporary_visa_student, temporary_visa_partner_309_820, expat_citizen_overseas, foreign_non_resident>, "accepted": bool, "maxLvrPct": n, "conditions": "…"}>,
    "foreignIncomeShadingPct": <fact, fraction>
  },
  "policyDocUrl": "<the credit policy guide you used>",
  "gaps": ["plain-English note for each thing you could not establish"]
}

Omit any field you could not source. Today is ${brisbaneToday()}.`;
}

type Proposal = {
  path: string;
  fact: Fact<unknown>;
  accepted: boolean;
  issues: (VerificationIssue | "dead_source" | "disallowed_source")[];
};

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const triggeredBy = auth;

  let lenderId = "";
  try {
    const body = (await req.json()) as { lenderId?: string; apply?: boolean };
    lenderId = (body.lenderId ?? "").trim();
    if (!lenderId) {
      return NextResponse.json({ ok: false, error: "lenderId is required" }, { status: 400 });
    }

    const { policy: existing } = await loadPolicy(lenderId);
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Unknown lender" }, { status: 404 });
    }

    const today = brisbaneToday();
    const raw = await orText({
      system: SYSTEM,
      user: userPrompt(existing),
      model: MODELS.smart,
      web: true,
      maxTokens: 8000,
      effort: "high",
    });

    // The model is asked for bare JSON but a fence still slips through.
    const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "The research pass did not return usable JSON. Nothing was changed." },
        { status: 502 },
      );
    }

    const candidate = hydratePolicy({
      ...(parsed as Partial<LenderPolicy>),
      id: existing.id,
      name: existing.name,
      tier: existing.tier,
      status: existing.status,
      brokerSiteUrl: existing.brokerSiteUrl,
      researchedAt: today,
      researchedBy: `research:${MODELS.smart}`,
      version: existing.version,
      effectiveFrom: existing.effectiveFrom,
    } as Partial<LenderPolicy> & { id: string; name: string });

    // ── Gate 1: shape, provenance, plausibility, confidence ──────────────
    const facts = policyFacts(candidate);
    const proposals: Proposal[] = facts.map(([path, fact]) => {
      const verdict = verifyFact(fact, { path, today });
      return {
        path,
        fact,
        accepted: verdict.matchable,
        issues: [...verdict.issues],
      };
    });

    // ── Gates 2 + 3: the source must resolve, and be the lender's own ────
    const urls = proposals
      .filter((p) => p.accepted && p.fact.sourceUrl)
      .map((p) => p.fact.sourceUrl as string);
    const checked = await checkSourceUrls(urls);
    for (const p of proposals) {
      if (!p.accepted || !p.fact.sourceUrl) continue;
      if (hostDisallowed(p.fact.sourceUrl)) {
        p.accepted = false;
        p.issues.push("disallowed_source");
        continue;
      }
      const result = checked.get(p.fact.sourceUrl);
      if (!result?.ok) {
        p.accepted = false;
        p.issues.push("dead_source");
      }
    }

    // Build the accepted-only policy. Rejected facts are NOT written — a
    // rejected fact silently stored as `unverified` would still show in the
    // reference library as if someone had read it somewhere.
    const accepted = hydratePolicy({
      ...existing,
      researchedAt: today,
      researchedBy: `research:${MODELS.smart}`,
      gaps: Array.isArray(parsed.gaps) ? (parsed.gaps as string[]) : existing.gaps,
      policyDocUrl:
        typeof parsed.policyDocUrl === "string" ? parsed.policyDocUrl : existing.policyDocUrl,
    });
    for (const p of proposals) {
      if (!p.accepted) continue;
      const [section, field] = p.path.split(".");
      const bag = (accepted as unknown as Record<string, Record<string, unknown>>)[section];
      if (bag) bag[field] = { ...p.fact, status: "verified" };
    }

    const rejections: Record<string, string[]> = {};
    for (const p of proposals) {
      if (!p.accepted) rejections[p.path] = p.issues;
    }
    const acceptedCount = proposals.filter((p) => p.accepted).length;

    let applied = false;
    let applyError: string | undefined;
    if (body.apply) {
      const result = await upsertPolicies([accepted], {
        changedBy: triggeredBy,
        reason: "research",
      });
      applied = result.ok;
      if (!result.ok) applyError = result.error ?? result.hint;
    }

    // Log the run. Best-effort — a missing table must not lose the research.
    try {
      await supabase.from("lender_policy_research_runs").insert({
        lender_id: lenderId,
        status: acceptedCount === 0 ? "failed" : rejections && Object.keys(rejections).length > 0 ? "partial" : "ok",
        model: MODELS.smart,
        fields_proposed: proposals.length,
        fields_accepted: acceptedCount,
        fields_rejected: proposals.length - acceptedCount,
        rejections,
        notes: applyError ?? null,
        triggered_by: triggeredBy,
      });
    } catch {
      /* the run log is an audit convenience, not a prerequisite */
    }

    log.info("lenders.research_run", {
      lenderId,
      proposed: proposals.length,
      accepted: acceptedCount,
      rejected: proposals.length - acceptedCount,
      applied,
    });

    return NextResponse.json({
      ok: true,
      lenderId,
      applied,
      applyError,
      proposed: proposals.length,
      accepted: acceptedCount,
      rejected: proposals.length - acceptedCount,
      rejections,
      policy: accepted,
      gaps: accepted.gaps ?? [],
    });
  } catch (error) {
    log.error("lenders.research_failed", { lenderId, ...errInfo(error) });
    return NextResponse.json(
      { ok: false, error: orErrorMessage(error) || "The research pass failed. Nothing was changed." },
      { status: 500 },
    );
  }
}
