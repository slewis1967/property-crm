/**
 * GET /api/partner/insights
 *
 * PUBLIC (session-scoped). The dashboard's AI insights: the deterministic
 * insights from utils/partner-insights.ts, reworded and ranked by Claude
 * (cached per partner per day), or the deterministic ones unchanged if the AI
 * call fails or its answer fails the brand/masking screen.
 */
import { NextResponse } from "next/server";
import { requirePartner } from "../_shared";
import { loadPartnerWorld } from "../../../partner/world";
import { buildInsights, dashboardStats } from "../../../../utils/partner-insights";
import { aiInsights } from "../../../../utils/partner-ai";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  try {
    const world = await loadPartnerWorld(auth);
    const now = new Date();
    const stats = dashboardStats(world.lots, world.clients, world.deals, now);
    const base = buildInsights(world.lots, world.clients, world.deals, now);
    const result = await aiInsights(auth.partnerId, base, stats);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[partner] insights failed", e);
    return NextResponse.json({ ok: false, error: "Insights are unavailable right now." }, { status: 503 });
  }
}
