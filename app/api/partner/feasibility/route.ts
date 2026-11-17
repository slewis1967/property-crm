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
 * Cost control: each firm has a monthly allowance of generated reports
 * (utils/partner-feasibility.ts monthlyAllowance), checked BEFORE the report
 * call; the interview step is rate-limited per firm; and the transcript and
 * address are size-capped. A generated report is saved for the firm, which is
 * also what the allowance counts.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { runPlanningFeasibility } from "../../../../utils/planning-feasibility";
import {
  boundedTranscript,
  brisbaneMonthStart,
  cleanAddress,
  monthlyAllowance,
} from "../../../../utils/partner-feasibility";
import { logPartnerEvent, readJson, requireFeature, requirePartner, type PartnerIdentity } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function usedThisMonth(identity: PartnerIdentity): Promise<number | null> {
  const { count, error } = await supabase
    .from("partner_feasibility_reports")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", identity.partnerId)
    .gte("created_at", brisbaneMonthStart().toISOString());
  return error ? null : (count ?? 0);
}

export async function GET() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "feasibility");
  if (locked) return locked;

  const [{ data }, used] = await Promise.all([
    supabase
      .from("partner_feasibility_reports")
      .select("id,address,title,created_at")
      .eq("partner_id", auth.partnerId)
      .order("created_at", { ascending: false })
      .limit(200),
    usedThisMonth(auth),
  ]);
  return NextResponse.json({
    ok: true,
    reports: (data ?? []).map((r) => ({ id: r.id, address: r.address, title: r.title, createdAt: r.created_at })),
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

  const limited = enforceRateLimit(req, {
    windowMs: 60 * 60_000,
    max: phase === "report" ? 15 : 30,
    keyFn: () => `partner-feasibility-${phase}:${auth.partnerId}`,
  });
  if (limited) return limited;

  const messages = boundedTranscript(body.messages);
  if (!messages) return NextResponse.json({ ok: false, error: "That assessment is too long. Start a new one." }, { status: 400 });

  if (phase === "report") {
    const used = await usedThisMonth(auth);
    const allowance = monthlyAllowance();
    if (used === null) {
      return NextResponse.json({ ok: false, error: "Couldn't check your plan allowance. Please try again." }, { status: 503 });
    }
    if (used >= allowance) {
      return NextResponse.json(
        { ok: false, error: `You've used all ${allowance} feasibility reports for this month. Ask your NextKey contact if you need more.`, code: "allowance_used" },
        { status: 429 },
      );
    }
  }

  const prepared =
    body.prepared && typeof body.prepared === "object"
      ? { location: (body.prepared as { location?: unknown }).location ?? null }
      : undefined;
  const r = await runPlanningFeasibility({ phase, address, messages, prepared }, { audience: "neutral" });
  if (phase !== "report" || r.status !== 200) return NextResponse.json(r.payload, { status: r.status });

  const report = (r.payload as { report?: Record<string, unknown> }).report ?? {};
  const objective = typeof body.objective === "string" ? body.objective.slice(0, 2000) : null;
  const { data: saved, error } = await supabase
    .from("partner_feasibility_reports")
    .insert({
      partner_id: auth.partnerId,
      created_by_user_id: auth.userId,
      address,
      objective,
      title: typeof report.title === "string" ? report.title.slice(0, 200) : null,
      report,
    })
    .select("id")
    .single();
  if (error || !saved) {
    // The model ran and was paid for; hand the report back even if saving failed.
    console.error("[partner-feasibility] save failed", error?.message);
    return NextResponse.json({ ok: true, report, id: null, saveError: "The report couldn't be saved. Print it now." });
  }

  await logPartnerEvent({
    partnerId: auth.partnerId,
    actorType: "partner",
    actor: auth.email,
    action: "feasibility_report_generated",
    detail: { report_id: saved.id, address },
  });
  return NextResponse.json({ ok: true, report, id: saved.id });
}
