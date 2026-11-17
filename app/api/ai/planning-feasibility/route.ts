import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { supabase } from "../../../../utils/supabase";
import { runPlanningFeasibility } from "../../../../utils/planning-feasibility";
import { requestStaffFeasibility } from "../../../../utils/feasibility-jobs";

export const dynamic = "force-dynamic";
// Web search + reasoning for a full report can run long; give it headroom.
export const maxDuration = 120;

/**
 * Planning Feasibility (staff) — AI-led, Australia-wide. The engine (prompts,
 * phases, geocode + satellite) lives in utils/planning-feasibility.ts, shared
 * with the partner portal; this route authenticates and passes through.
 *
 * The "report" phase is NOT run here: a report takes 30-50s and the request
 * path gives up at ~30s (504) while the function runs on, so finished reports
 * were lost. Instead it stores a feasibility_jobs row, hands it to the
 * background function and returns 202 { jobId }; the page polls
 * GET /api/ai/planning-feasibility/jobs/<jobId>. "prepare" and "interview" are
 * short and stay synchronous.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  if (body?.phase !== "report") {
    const r = await runPlanningFeasibility(body, { audience: "nextkey" });
    return NextResponse.json(r.payload, { status: r.status });
  }

  // Same transcript checks the engine makes, before anything is queued.
  const messages = Array.isArray(body.messages)
    ? (body.messages as { role?: unknown; content?: unknown }[]).filter(
        (m) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string" && m.content,
      )
    : [];
  if (messages.length === 0 || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ ok: false, error: "The conversation must start and end with your message." }, { status: 400 });
  }
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const prepared = body.prepared as { location?: unknown } | undefined;

  const { data: job, error } = await supabase
    .from("feasibility_jobs")
    .insert({
      created_by: auth,
      address: address || null,
      // The satellite tile is not used by the report call, so it is not stored.
      request: { address, messages, prepared: prepared && "location" in prepared ? { location: prepared.location ?? null } : null },
    })
    .select("id")
    .single();
  if (error || !job) {
    return NextResponse.json({ ok: false, error: "Couldn't start the report. Please try again." }, { status: 503 });
  }
  if (!(await requestStaffFeasibility(job.id))) {
    await supabase
      .from("feasibility_jobs")
      .update({ status: "failed", error: "Couldn't start the background job." })
      .eq("id", job.id)
      .is("job_started_at", null);
    return NextResponse.json({ ok: false, error: "Couldn't start the report. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, jobId: job.id, status: "pending" }, { status: 202 });
}
