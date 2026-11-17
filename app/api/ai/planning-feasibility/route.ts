import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { runPlanningFeasibility } from "../../../../utils/planning-feasibility";

export const dynamic = "force-dynamic";
// Web search + reasoning for a full report can run long; give it headroom.
export const maxDuration = 120;

/**
 * Planning Feasibility (staff) — AI-led, Australia-wide. The engine (prompts,
 * phases, geocode + satellite) lives in utils/planning-feasibility.ts, shared
 * with the partner portal; this route only authenticates and passes through.
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
  const r = await runPlanningFeasibility(body, { audience: "nextkey" });
  return NextResponse.json(r.payload, { status: r.status });
}
