import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import { DEFAULT_INPUTS, type PiaInputs } from "@/app/pia/_calc";
import type { DealPacket, AssumptionSource } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/assumptions
 *   { deal_packet_id, properties: [{ index, pia_inputs, pia_sources?, room_rent? }] }
 *
 * Persists the full per-property PIA assumptions (operator-edited + AI-researched)
 * plus their citations. Keeps the canonical price/rent in sync on specs/rent_basis so
 * the other edit paths (rent field, AI changes) stay consistent. Recomputes status.
 */
const KEYS = Object.keys(DEFAULT_INPUTS) as (keyof PiaInputs)[];

function sanitizeInputs(incoming: Record<string, unknown> | null | undefined): PiaInputs {
  const out = { ...DEFAULT_INPUTS };
  for (const k of KEYS) {
    const v = Number(incoming?.[k]);
    if (isFinite(v)) out[k] = v;
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { deal_packet_id, properties } = await req.json().catch(() => ({}));
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }
  if (!Array.isArray(properties) || properties.length === 0) {
    return NextResponse.json({ error: "properties[] is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase.from("deal_packets").select("id, packet").eq("id", deal_packet_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const packet = dp.packet as DealPacket;
  const props = packet.properties ?? [];

  for (const entry of properties) {
    const i = Number(entry?.index);
    if (!Number.isInteger(i) || i < 0 || i >= props.length) {
      return NextResponse.json({ error: `invalid property index ${entry?.index}` }, { status: 400 });
    }
    const prop = props[i];
    const inputs = sanitizeInputs(entry.pia_inputs);
    prop.pia_inputs = inputs;

    // Citations (AI-researched), sanitized.
    if (Array.isArray(entry.pia_sources)) {
      prop.pia_sources = entry.pia_sources.slice(0, 12).map((s: { field?: string | null; label?: string | null; value?: number | string | null; source?: string | null; date?: string | null }): AssumptionSource => ({
        field: String(s?.field ?? "").slice(0, 60),
        label: String(s?.label ?? "").slice(0, 120),
        value: Number(s?.value) || 0,
        source: String(s?.source ?? "").slice(0, 120),
        date: String(s?.date ?? "").slice(0, 40),
      }));
    }

    // Keep canonical price/rent in sync (specs + rent_basis are read by the other paths).
    if (prop.specs) prop.specs.total_price = inputs.purchasePrice;
    const rb = prop.rent_basis;
    rb.weekly_rent = inputs.weeklyRent;
    rb.source = "operator";
    const roomRent = Number(entry.room_rent);
    if (rb.per_room && isFinite(roomRent) && roomRent > 0) rb.room_rent = roomRent;

    // Contract structure + land price (the dual-contract stamp-duty base).
    if (entry.contract_type === "single" || entry.contract_type === "dual") prop.contract_type = entry.contract_type;
    if (typeof entry.property_type === "string" && entry.property_type) prop.property_type = entry.property_type;
    const lp = Number(entry.land_price);
    if (prop.specs && isFinite(lp) && lp > 0) prop.specs.land_price = Math.round(lp);
    if (prop.specs && typeof entry.state === "string" && entry.state) prop.specs.state = entry.state;
  }

  const allHaveRent = props.every((p) => p.rent_basis.weekly_rent != null);
  const status = allHaveRent ? "ready" : "needs_rent_input";
  packet.status = status;

  const { error: upErr } = await supabase.from("deal_packets").update({ packet, status }).eq("id", dp.id);
  if (upErr) return NextResponse.json({ error: `update failed: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
