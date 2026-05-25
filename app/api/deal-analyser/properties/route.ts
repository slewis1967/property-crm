import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import type { DealPacket, DealPacketProperty } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/properties  { deal_packet_id, action, ... }
 *
 * Mutates the packet's property list:
 *   - action "add"    { property: {...} }            append a manually-entered property
 *   - action "delete" { index }                      remove a property
 *   - action "move"   { index, direction: up|down }  reorder (swap with neighbour)
 *
 * Recomputes property_count + status. Reports are rebuilt on the next generate
 * (which replaces the prior set), so deleting a property drops it from the reports.
 */
const num = (v: unknown): number | null => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n : null;
};

function buildProperty(input: any): DealPacketProperty {
  const beds = num(input?.bedrooms);
  const perRoom = !!input?.per_room || !!input?.is_co_living && !!input?.room_rent;
  const roomRent = num(input?.room_rent);
  const weeklyDirect = num(input?.weekly_rent);
  const weekly = perRoom && roomRent && beds ? Math.round(roomRent * beds) : weeklyDirect;
  return {
    suburb: typeof input?.suburb === "string" ? input.suburb.trim() || null : null,
    address: typeof input?.address === "string" ? input.address.trim() || null : null,
    specs: {
      total_price: num(input?.total_price),
      land_price: null,
      build_price: null,
      land_size_m2: num(input?.land_size_m2),
      house_size_m2: null,
      estate: null,
      house_design: null,
      bedrooms: beds,
      bathrooms: num(input?.bathrooms),
      car_spaces: null,
      living_areas: null,
      is_co_living: !!input?.is_co_living,
      key_inclusions: [],
      image_paths: [],
    },
    market: null,
    rent_basis: {
      weekly_rent: weekly,
      per_room: !!input?.is_co_living,
      rooms: beds,
      room_rent: input?.is_co_living ? roomRent : null,
      source: weekly != null ? "operator" : null,
    },
    thesis_points: [],
    verify_flags: ["Manually added by operator — not extracted from an email."],
  };
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const { deal_packet_id, action } = body;
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase.from("deal_packets").select("id, packet").eq("id", deal_packet_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const packet = dp.packet as DealPacket;
  const props = packet.properties ?? [];

  if (action === "add") {
    props.push(buildProperty(body.property ?? {}));
  } else if (action === "delete") {
    const i = Number(body.index);
    if (!Number.isInteger(i) || i < 0 || i >= props.length) {
      return NextResponse.json({ error: `invalid index ${body.index}` }, { status: 400 });
    }
    props.splice(i, 1);
  } else if (action === "move") {
    const i = Number(body.index);
    const j = body.direction === "up" ? i - 1 : i + 1;
    if (!Number.isInteger(i) || i < 0 || i >= props.length || j < 0 || j >= props.length) {
      return NextResponse.json({ error: "can't move past the ends" }, { status: 400 });
    }
    [props[i], props[j]] = [props[j], props[i]];
  } else {
    return NextResponse.json({ error: "action must be add | delete | move" }, { status: 400 });
  }

  packet.properties = props;
  const status = props.length === 0 ? "extracting" : props.every((p) => p.rent_basis.weekly_rent != null) ? "ready" : "needs_rent_input";
  packet.status = status;

  const { error: upErr } = await supabase
    .from("deal_packets")
    .update({ packet, status, property_count: props.length })
    .eq("id", dp.id);
  if (upErr) return NextResponse.json({ error: `update failed: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, property_count: props.length, status });
}
