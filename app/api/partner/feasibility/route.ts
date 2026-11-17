/**
 * Planning feasibility for channel partners (Enterprise: `feasibility`).
 *
 *   GET  /api/partner/feasibility — this firm's saved reports + this month's usage
 *   POST /api/partner/feasibility — one phase of the flow:
 *        { phase: "prepare", address }
 *        { phase: "interview" | "report", address, objective?, messages, prepared? }
 *
 * PUBLIC (session-scoped). Same engine as the staff tool
 * (utils/planning-feasibility.ts) with audience "neutral", so the report names
 * no firm and goes out under the partner's brand.
 *
 * COST CONTROL
 *  - The monthly allowance is enforced in the database, BEFORE the model runs:
 *    claim_partner_feasibility_slot takes a per-firm lock, counts this month's
 *    pending + ready reports and inserts a 'pending' row only if there is room.
 *    Parallel requests cannot both take the last slot, and a report whose save
 *    later fails still counts (its row stays pending).
 *  - The slot is released only when the engine refused the request before
 *    calling the model (400). A failure after a model call still counts.
 *  - Every phase, including the geocode-only "prepare", is rate-limited per firm
 *    with a key that ignores the URL (enforceKeyedRateLimit). That limiter is
 *    in-memory, so it is a brake on loops, not the allowance.
 *  - Address and transcript are size-capped.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { enforceKeyedRateLimit } from "../../../../utils/rate-limit";
import { runPlanningFeasibility } from "../../../../utils/planning-feasibility";
import {
  boundedTranscript,
  brisbaneMonthStart,
  cleanAddress,
  monthlyAllowance,
  storableReport,
} from "../../../../utils/partner-feasibility";
import { feasibilityUsedThisMonth, listFeasibilityReports } from "../../../../utils/partner-feasibility-db";
import { logPartnerEvent, readJson, requireFeature, requirePartner } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PHASE_LIMITS = { prepare: 30, interview: 30, report: 15 } as const;

export async function GET() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "feasibility");
  if (locked) return locked;

  const [reports, used] = await Promise.all([
    listFeasibilityReports(auth.partnerId),
    feasibilityUsedThisMonth(auth.partnerId),
  ]);
  return NextResponse.json({
    ok: true,
    reports: reports.map((r) => ({ id: r.id, address: r.address, title: r.title, createdAt: r.created_at })),
    usage: { used, allowance: monthlyAllowance() },
  });
}

export async function POST(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "feasibility");
  if (locked) return locked;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const phase = body.phase === "report" ? "report" : body.phase === "prepare" ? "prepare" : "interview";

  const limited = enforceKeyedRateLimit(`partner-feasibility:${phase}:${auth.partnerId}`, {
    windowMs: 60 * 60_000,
    max: PHASE_LIMITS[phase],
  });
  if (limited) return limited;

  const address = cleanAddress(body.address);
  if (!address) return NextResponse.json({ ok: false, error: "Enter the full street address." }, { status: 400 });

  if (phase === "prepare") {
    const r = await runPlanningFeasibility({ phase, address }, { audience: "neutral" });
    // The partner page only needs the coordinates; the satellite tile (~180KB)
    // is not used by the report call and need not travel.
    const { satellite: _drop, ...rest } = r.payload as Record<string, unknown> & { satellite?: unknown };
    void _drop;
    return NextResponse.json(rest, { status: r.status });
  }

  const messages = boundedTranscript(body.messages);
  if (!messages) return NextResponse.json({ ok: false, error: "That assessment is too long. Start a new one." }, { status: 400 });
  const prepared =
    body.prepared && typeof body.prepared === "object"
      ? { location: (body.prepared as { location?: unknown }).location ?? null }
      : undefined;

  if (phase === "interview") {
    const r = await runPlanningFeasibility({ phase, address, messages, prepared }, { audience: "neutral" });
    return NextResponse.json(r.payload, { status: r.status });
  }

  // ── report: claim the slot first ──
  const objective = typeof body.objective === "string" ? body.objective.slice(0, 2000) : null;
  const allowance = monthlyAllowance();
  const { data: slotId, error: claimErr } = await supabase.rpc("claim_partner_feasibility_slot", {
    p_partner_id: auth.partnerId,
    p_user_id: auth.userId,
    p_address: address,
    p_objective: objective,
    p_allowance: allowance,
    p_since: brisbaneMonthStart().toISOString(),
  });
  if (claimErr) {
    console.error("[partner-feasibility] slot claim failed", claimErr.message);
    return NextResponse.json({ ok: false, error: "Couldn't check your plan allowance. Please try again." }, { status: 503 });
  }
  if (!slotId) {
    return NextResponse.json(
      { ok: false, error: `You've used all ${allowance} feasibility reports for this month. Ask your NextKey contact if you need more.`, code: "allowance_used" },
      { status: 429 },
    );
  }

  const r = await runPlanningFeasibility({ phase, address, messages, prepared }, { audience: "neutral" });
  if (r.status !== 200) {
    // 400 = the engine refused the request before calling the model, so it
    // cost nothing: release the slot. Any later failure (unparseable or empty
    // report, model error) happened after a paid model call, so the slot stays
    // claimed and counts. Releasing those would let a crafted transcript buy
    // unlimited model runs by failing on purpose.
    if (r.status === 400) {
      await supabase.from("partner_feasibility_reports").delete().eq("id", slotId).eq("status", "pending");
    }
    return NextResponse.json(r.payload, { status: r.status });
  }

  const report = storableReport((r.payload as { report?: unknown }).report);
  const { error: saveErr } = await supabase
    .from("partner_feasibility_reports")
    .update({
      status: "ready",
      title: typeof report.title === "string" ? report.title.slice(0, 200) : null,
      report,
    })
    .eq("id", slotId)
    .eq("partner_id", auth.partnerId);

  await logPartnerEvent({
    partnerId: auth.partnerId,
    actorType: "partner",
    actor: auth.email,
    action: "feasibility_report_generated",
    detail: { report_id: slotId, address, saved: !saveErr },
  });

  if (saveErr) {
    // The slot stays 'pending', so this report still counts toward the allowance.
    console.error("[partner-feasibility] save failed", saveErr.message);
    return NextResponse.json({ ok: true, report, id: null, saveError: "The report was written but couldn't be saved. Please contact NextKey." });
  }
  return NextResponse.json({ ok: true, report, id: slotId });
}
