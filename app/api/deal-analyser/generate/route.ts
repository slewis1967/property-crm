import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth, userEmailFromRequest } from "@/utils/cf-access";
import { runPia } from "@/app/pia/_calc";
import { dealPacketPropertyToPia } from "@/utils/deal-packet-to-pia";
import type { DealPacket } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/generate  { deal_packet_id }
 *
 * Phase 1 spine. Reads a verified deal-packet, and for each property:
 *   - maps it to PIA inputs (conservative forward growth; body history kept as
 *     sourced context only — see utils/deal-packet-to-pia.ts),
 *   - runs the existing PIA engine (app/pia/_calc.ts),
 *   - writes a pia_report (attached to the opportunity), storing the projection
 *     PLUS the sourced MarketContext + derivation notes in `results`.
 *
 * Co-living (or any) property with no rent yet is NOT reported — it's returned
 * in `needs_rent_input` so the UI can prompt the operator. Nothing is fabricated.
 * Auto-generate, manual-deliver: this builds reports onto the opportunity; a
 * human still approves before a client sees them.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const user = userEmailFromRequest(req);

  const { deal_packet_id } = await req.json().catch(() => ({}));
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase
    .from("deal_packets")
    .select("id, opportunity_id, packet")
    .eq("id", deal_packet_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const packet = dp.packet as DealPacket;
  const generated: { suburb: string | null; report_id: string }[] = [];
  const needsRent: string[] = [];

  for (const property of packet.properties ?? []) {
    const mapping = dealPacketPropertyToPia(property);
    if (mapping.needs_rent_input) {
      needsRent.push(property.suburb ?? "(unknown)");
      continue;
    }
    // Projection + sourced context travel together in `results` for the template.
    const results = {
      ...runPia(mapping.inputs),
      marketContext: mapping.marketContext,
      sourceNotes: mapping.notes,
      // carried so the report page is self-contained (specs incl. image_paths)
      propertySpecs: property.specs,
      address: property.address,
      suburb: property.suburb,
      thesisPoints: property.thesis_points,
    };
    const title = `PIA — ${property.address ?? property.suburb ?? "Property"}`;
    const { data: rep, error: repErr } = await supabase
      .from("pia_reports")
      .insert({
        title,
        inputs: mapping.inputs,
        results,
        opportunity_id: dp.opportunity_id ?? null,
        property_id: null,
        generated_by: user,
      })
      .select("id")
      .single();
    if (repErr) {
      return NextResponse.json({ error: `report insert failed: ${repErr.message}` }, { status: 500 });
    }
    generated.push({ suburb: property.suburb, report_id: rep.id });
  }

  const status = needsRent.length > 0 ? "needs_rent_input" : "reports_generated";
  await supabase.from("deal_packets").update({ status }).eq("id", dp.id);

  return NextResponse.json({ ok: true, status, generated, needs_rent_input: needsRent });
}
