import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import type { DealPacket } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/attach
 *   { deal_packet_id, opportunity_id?, operator_notes? }
 *
 * Updates a packet's CRM linkage + operator notes. Both fields optional, so the
 * hub can call this on a picker change (opportunity only) or before generating
 * (notes only / both).
 *
 *   - opportunity_id: set on the packet AND cascaded onto any pia_reports already
 *     generated from it (matched via results.deal_packet_id), so an after-the-fact
 *     attach surfaces the existing reports inside the opportunity. Pass null to detach.
 *   - operator_notes: the "changes / extra info to include" free text. Stored on the
 *     packet; baked into reports at the NEXT generate (existing reports are snapshots).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { deal_packet_id } = body;
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }
  const setOpportunity = "opportunity_id" in body;
  const setNotes = "operator_notes" in body;
  const setOverride = body.compliance_override && typeof body.compliance_override === "object";
  if (!setOpportunity && !setNotes && !setOverride) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const { data: dp, error } = await supabase
    .from("deal_packets")
    .select("id, packet")
    .eq("id", deal_packet_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const packet = dp.packet as DealPacket;
  const update: Record<string, unknown> = {};

  if (setOpportunity) {
    const oppId =
      typeof body.opportunity_id === "string" && body.opportunity_id.trim()
        ? body.opportunity_id.trim()
        : null;
    update.opportunity_id = oppId;
  }
  if (setNotes) {
    const notes = typeof body.operator_notes === "string" ? body.operator_notes.trim().slice(0, 4000) : "";
    packet.operator_notes = notes || null;
    update.packet = packet;
  }
  if (setOverride) {
    const ov = body.compliance_override;
    const full_name = typeof ov.full_name === "string" ? ov.full_name.trim() : "";
    if (!full_name) {
      return NextResponse.json({ error: "compliance_override requires full_name" }, { status: 400 });
    }
    const record = {
      full_name,
      acknowledged_at: new Date().toISOString(),
      flagged_text: typeof ov.flagged_text === "string" ? ov.flagged_text.slice(0, 4000) : "",
      violations: Array.isArray(ov.violations)
        ? ov.violations.slice(0, 20).map((v: { law?: string | null; severity?: string | null; snippet?: string | null }) => ({
            law: String(v?.law ?? "").slice(0, 120),
            severity: String(v?.severity ?? "").slice(0, 10),
            snippet: String(v?.snippet ?? "").slice(0, 400),
          }))
        : [],
    };
    packet.compliance_overrides = [...(packet.compliance_overrides ?? []), record];
    update.packet = packet;
  }

  const { error: upErr } = await supabase.from("deal_packets").update(update).eq("id", dp.id);
  if (upErr) return NextResponse.json({ error: `update failed: ${upErr.message}` }, { status: 500 });

  // Cascade the opportunity onto reports already generated from this packet.
  let reports_updated = 0;
  if (setOpportunity) {
    const { data: touched, error: cErr } = await supabase
      .from("pia_reports")
      .update({ opportunity_id: update.opportunity_id })
      .eq("results->>deal_packet_id", dp.id)
      .select("id");
    if (cErr) return NextResponse.json({ error: `report cascade failed: ${cErr.message}` }, { status: 500 });
    reports_updated = touched?.length ?? 0;
  }

  return NextResponse.json({ ok: true, opportunity_id: update.opportunity_id ?? undefined, reports_updated });
}
