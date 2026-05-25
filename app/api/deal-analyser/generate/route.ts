import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth, userEmailFromRequest } from "@/utils/cf-access";
import { runPia } from "@/app/pia/_calc";
import { dealPacketPropertyToPia } from "@/utils/deal-packet-to-pia";
import { buildComparison, type ComparisonInput } from "@/utils/deal-comparison";
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

  // Idempotent regenerate: clear any prior reports for this packet first, so
  // re-running (e.g. after a rent/price change) replaces the set instead of
  // piling up duplicates. Reports are re-created fresh below.
  await supabase.from("pia_reports").delete().eq("results->>deal_packet_id", dp.id);

  const generated: { suburb: string | null; report_id: string }[] = [];
  const needsRent: string[] = [];
  const compInputs: ComparisonInput[] = [];

  for (const property of packet.properties ?? []) {
    const mapping = dealPacketPropertyToPia(property);
    if (mapping.needs_rent_input) {
      needsRent.push(property.suburb ?? "(unknown)");
      continue;
    }
    const pia = runPia(mapping.inputs);
    // Projection + sourced context travel together in `results` for the template.
    const results = {
      // kind + deal_packet_id let the opportunity panel route to the right page
      // and let attach cascade the opportunity_id onto already-generated reports.
      kind: "deal_analyser_pia",
      deal_packet_id: dp.id,
      ...pia,
      marketContext: mapping.marketContext,
      sourceNotes: mapping.notes,
      assumptionSources: mapping.sources,
      // carried so the report page is self-contained (specs incl. image_paths)
      propertySpecs: property.specs,
      // drives the co-living income callout (per_room / room_rent / rooms / weekly_rent)
      rentBasis: property.rent_basis,
      // operator's free-text changes / extra info, rendered in the report
      operatorNotes: packet.operator_notes ?? null,
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
    compInputs.push({
      suburb: property.suburb,
      address: property.address,
      grossYield: pia.grossYield ?? null,
      netYield: pia.netYield ?? null,
      price: property.specs?.total_price ?? mapping.inputs.purchasePrice ?? null,
      land_size_m2: property.specs?.land_size_m2 ?? null,
      is_co_living: property.specs?.is_co_living ?? false,
      rooms: property.specs?.bedrooms ?? null,
      weekly_rent: mapping.inputs.weeklyRent ?? null,
      vacancy_rate_pct: property.market?.vacancy_rate_pct ?? null,
    });
  }

  // One comparison report across every property that produced a PIA (≥2). Holds
  // the 1–10 ratings + best-pick recommendation; stored as a pia_report tagged
  // kind=comparison so it attaches to the opportunity and is PDF-exportable too.
  let comparison_report_id: string | null = null;
  if (compInputs.length >= 2) {
    const comparison = buildComparison(compInputs);
    const { data: cmp, error: cmpErr } = await supabase
      .from("pia_reports")
      .insert({
        title: `Comparison — ${compInputs.length} properties`,
        inputs: {},
        results: { kind: "comparison", deal_packet_id: dp.id, comparison },
        opportunity_id: dp.opportunity_id ?? null,
        property_id: null,
        generated_by: user,
      })
      .select("id")
      .single();
    if (cmpErr) {
      return NextResponse.json({ error: `comparison insert failed: ${cmpErr.message}` }, { status: 500 });
    }
    comparison_report_id = cmp.id;
  }

  const status = needsRent.length > 0 ? "needs_rent_input" : "reports_generated";
  await supabase.from("deal_packets").update({ status }).eq("id", dp.id);

  return NextResponse.json({ ok: true, status, generated, comparison_report_id, needs_rent_input: needsRent });
}
