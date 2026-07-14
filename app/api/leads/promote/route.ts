import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { nexusApi } from "@/utils/nexus-api";

export const dynamic = "force-dynamic";

/**
 * POST — promote an intake lead (Supabase `property_leads`) into the NEXUS
 * opportunities pipeline. Creates the opportunity via the same NEXUS endpoint
 * the New Opportunity modal uses, then stamps `promoted_at` +
 * `promoted_opportunity_id` on the lead so the intake inbox drops it.
 * Body: { leadId, pipeline_id?, stage? }
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: { leadId?: unknown; pipeline_id?: unknown; stage?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (!leadId) return NextResponse.json({ ok: false, error: "leadId is required." }, { status: 400 });

  // Read the intake lead.
  const { data: lead, error: readErr } = await supabase
    .from("property_leads")
    .select("id,name,email,phone,source,state,buyer_type,budget")
    .eq("id", leadId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ ok: false, error: "Lead not found." }, { status: 404 });

  // Create the opportunity in NEXUS (mirrors POST /api/opportunities).
  const oppBody: Record<string, unknown> = {
    full_name: lead.name || lead.email || "Lead",
    email: lead.email || "",
    phone: lead.phone || "",
    source: lead.source || "lead_promote",
    state: lead.state || null,
    buyer_type: lead.buyer_type || null,
  };
  if (typeof body.pipeline_id === "string" && body.pipeline_id) oppBody.pipeline_id = body.pipeline_id;
  if (typeof body.stage === "string" && body.stage) oppBody.ghl_stage = body.stage;

  let opp: Record<string, unknown> = {};
  try {
    const res = await nexusApi("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(oppBody),
    });
    const raw = await res.text();
    try {
      opp = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "NEXUS API unreachable — the opportunity was not created." }, { status: 503 });
    }
    if (!res.ok) {
      const e = typeof opp.error === "string" ? opp.error : "NEXUS rejected the opportunity.";
      return NextResponse.json({ ok: false, error: e }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "NEXUS error" }, { status: 503 });
  }

  const nested = opp.lead as Record<string, unknown> | undefined;
  const opportunityId = String(opp.id ?? opp.lead_id ?? nested?.id ?? "") || null;

  // Mark the intake lead promoted (best-effort; needs the migration applied).
  let marked = false;
  try {
    const { error: updErr } = await supabase
      .from("property_leads")
      .update({ promoted_at: new Date().toISOString(), promoted_opportunity_id: opportunityId })
      .eq("id", leadId);
    marked = !updErr;
  } catch {
    marked = false;
  }

  return NextResponse.json({ ok: true, opportunityId, marked });
}
