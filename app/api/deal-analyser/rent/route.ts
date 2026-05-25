import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import type { DealPacket } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/rent
 *   { deal_packet_id, rents: [{ index, weekly_rent?, per_room_rent?, price? }] }
 *
 * Applies per-property operator edits — rent and/or price. Used both to supply a
 * missing rent (status="needs_rent_input") and to CHANGE already-set values (a
 * manual field edit, or an AI-parsed change). Each field is optional per entry;
 * only the ones provided are written.
 *
 * Never fabricated: the figure comes from the operator and is attributed
 * source="operator" (a NextKey estimate), not presented as a builder-quoted rent.
 *   - co-living  → operator gives per-room rent; gross weekly_rent = rooms × per_room.
 *   - single let → operator gives the weekly_rent directly.
 *
 * Recomputes status: "ready" once every property has a weekly_rent, else it stays
 * "needs_rent_input". Idempotent — re-submitting just overwrites the figures.
 */
export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { deal_packet_id, rents } = await req.json().catch(() => ({}));
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }
  if (!Array.isArray(rents) || rents.length === 0) {
    return NextResponse.json({ error: "rents[] is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase
    .from("deal_packets")
    .select("id, packet")
    .eq("id", deal_packet_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const packet = dp.packet as DealPacket;
  const props = packet.properties ?? [];

  const pos = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
  for (const entry of rents) {
    const i = Number(entry?.index);
    if (!Number.isInteger(i) || i < 0 || i >= props.length) {
      return NextResponse.json({ error: `edit entry has invalid index ${entry?.index}` }, { status: 400 });
    }
    const prop = props[i];
    const rb = prop.rent_basis;

    // Rent (optional) — only when a rent field is supplied.
    if (entry.per_room_rent != null || entry.weekly_rent != null) {
      if (rb.per_room) {
        const perRoom = pos(entry.per_room_rent);
        const rooms = rb.rooms ?? prop.specs?.bedrooms ?? null;
        if (perRoom == null || !rooms) {
          return NextResponse.json(
            { error: `co-living property "${prop.suburb ?? i}" needs a positive per-room rent and a room count` },
            { status: 400 },
          );
        }
        rb.room_rent = perRoom;
        rb.rooms = rooms;
        rb.weekly_rent = Math.round(perRoom * rooms);
      } else {
        const weekly = pos(entry.weekly_rent);
        if (weekly == null) {
          return NextResponse.json(
            { error: `property "${prop.suburb ?? i}" needs a positive weekly rent` },
            { status: 400 },
          );
        }
        rb.weekly_rent = Math.round(weekly);
      }
      rb.source = "operator";
    }

    // Price (optional).
    if (entry.price != null) {
      const price = pos(entry.price);
      if (price == null) {
        return NextResponse.json({ error: `property "${prop.suburb ?? i}" needs a positive price` }, { status: 400 });
      }
      if (!prop.specs) {
        return NextResponse.json({ error: `property "${prop.suburb ?? i}" has no specs to set a price on` }, { status: 400 });
      }
      prop.specs.total_price = Math.round(price);
    }
  }

  // "ready" only once every property has a usable rent.
  const allHaveRent = props.every((p) => p.rent_basis.weekly_rent != null);
  const status = allHaveRent ? "ready" : "needs_rent_input";
  packet.status = status;

  const { error: upErr } = await supabase
    .from("deal_packets")
    .update({ packet, status })
    .eq("id", dp.id);
  if (upErr) return NextResponse.json({ error: `update failed: ${upErr.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, status });
}
