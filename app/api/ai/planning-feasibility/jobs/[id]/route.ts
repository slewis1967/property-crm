/**
 * GET /api/ai/planning-feasibility/jobs/<id> — a staff feasibility report being
 * written in the background: { status: pending | ready | failed, report?, error? }.
 *
 * Staff only (Cloudflare Access via requireAuth). Re-triggers once a minute if
 * the hand-over to the background function was lost (claimed over a minute ago,
 * never started); the job's conditional start stops a double run. A job stuck
 * for over ten minutes reads as failed (feasibilityView).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../../utils/cf-access";
import { supabase } from "../../../../../../utils/supabase";
import { enforceKeyedRateLimit } from "../../../../../../utils/rate-limit";
import { feasibilityView } from "../../../../../../utils/partner-feasibility";
import { requestStaffFeasibility } from "../../../../../../utils/feasibility-jobs";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const { data } = await supabase
    .from("feasibility_jobs")
    .select("id,status,report,error,created_at,job_started_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const view = feasibilityView(data);
  if (view.needsRetrigger && !enforceKeyedRateLimit(`feasibility-retrigger:${id}`, { windowMs: 60_000, max: 1 })) {
    await requestStaffFeasibility(id);
  }
  return NextResponse.json({
    ok: true,
    status: view.status,
    error: view.error,
    report: view.status === "ready" ? data.report : undefined,
  });
}
