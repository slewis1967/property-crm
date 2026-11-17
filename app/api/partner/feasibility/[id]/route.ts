/**
 * GET /api/partner/feasibility/<id> — where a report is: pending, ready or
 * failed. Polled by the report page while the background function writes it.
 *
 * PUBLIC (session-scoped): filtered on the session's firm, so another firm's
 * id is a 404.
 *
 * Self-heal: if a report is still pending, nobody has started it and it was
 * claimed over a minute ago, the hand-over to the background function was
 * lost, so this asks again (at most once a minute per report). The job's own
 * conditional start means a second trigger can never run the model twice.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { enforceKeyedRateLimit } from "../../../../../utils/rate-limit";
import { requestPartnerFeasibility } from "../../../../../utils/partner-feasibility-job";
import { feasibilityView } from "../../../../../utils/partner-feasibility";
import { requireFeature, requirePartner } from "../../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "feasibility");
  if (locked) return locked;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const { data } = await supabase
    .from("partner_feasibility_reports")
    .select("id,status,error,created_at,job_started_at")
    .eq("id", id)
    .eq("partner_id", auth.partnerId)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const view = feasibilityView(data);
  if (view.needsRetrigger && !enforceKeyedRateLimit(`partner-feasibility-retrigger:${id}`, { windowMs: 60_000, max: 1 })) {
    await requestPartnerFeasibility(id);
  }
  return NextResponse.json({ ok: true, status: view.status, error: view.error });
}
