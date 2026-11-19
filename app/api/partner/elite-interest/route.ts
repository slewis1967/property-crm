/**
 * POST /api/partner/elite-interest  { source?: string, billing?: "monthly" | "annual" }
 *
 * PUBLIC (session-scoped). Records that a firm wants the Elite trial. No
 * payment, no plan change: it writes one partner_events row
 * (action "elite_trial_interest") for the partner manager to follow up.
 * partner_events already exists, so no migration is needed.
 */
import { NextResponse } from "next/server";
import { logPartnerEvent, readJson, requirePartner } from "../_shared";
import { ELITE_TERMS, PLAN_PRICING } from "../../../../utils/partner-plans";

export const dynamic = "force-dynamic";

const SOURCES = new Set(["dashboard", "studio", "plans", "week"]);

export async function POST(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const source = typeof body.source === "string" && SOURCES.has(body.source) ? body.source : "plans";
  const billing = body.billing === "annual" ? "annual" : "monthly";
  await logPartnerEvent({
    partnerId: auth.partnerId,
    actorType: "partner",
    actor: auth.email,
    action: "elite_trial_interest",
    detail: {
      user_id: auth.userId,
      current_tier: auth.tier,
      source,
      billing,
      trial_days: ELITE_TERMS.trialDays,
      quoted_monthly: PLAN_PRICING.elite.monthly,
      quoted_founding_monthly: ELITE_TERMS.foundingMonthly,
    },
  });
  return NextResponse.json({ ok: true, trialDays: ELITE_TERMS.trialDays });
}
