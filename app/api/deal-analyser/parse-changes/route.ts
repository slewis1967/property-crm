import { NextRequest, NextResponse } from "next/server";
import { MODELS, orText } from "@/utils/openrouter";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import { reviewDealNote, type Violation } from "@/utils/compliance-review";
import type { DealPacket } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/parse-changes  { deal_packet_id, instruction }
 *
 * Turns an operator's plain-English change request into STRUCTURED, validated edits
 * — but only PROPOSES them. Nothing is written here; the hub shows the proposal for
 * confirmation, then applies via /api/deal-analyser/rent (+ regenerate). This keeps
 * a human in the loop before any client-facing figure moves (same posture as the
 * voice assistant's confirm-before-send).
 *
 * Only rent (room_rent / weekly_rent) and price are editable by the AI; anything
 * non-numeric or unmatched is returned as `extra_info` to include as a report note.
 */
const AUD = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

const SYSTEM = `You convert an operator's plain-English change request for a property
investment packet into structured edits. Return STRICT JSON only:
{"edits":[{"property_index":<int>,"field":"room_rent"|"weekly_rent"|"price","value":<number>}],"extra_info":<string>}

Rules:
- Only room_rent, weekly_rent, price can be edited. For a co-living (per_room=true)
  property a rent change is "room_rent"; for single-tenancy it's "weekly_rent".
- Match the property the instruction names (suburb / address / lot). If it's
  ambiguous or you can't match it, DON'T guess — leave that request in extra_info.
- value is a plain number: no $, no commas, no "/wk". Never invent a value the
  instruction didn't state.
- Put any non-numeric request or note (and anything you couldn't turn into an edit)
  into extra_info. If the instruction is purely informational, edits=[].`;

function extractJson(text: string): string {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  return a >= 0 && b > a ? text.slice(a, b + 1) : text;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { deal_packet_id, instruction } = await req.json().catch(() => ({}));
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }
  if (!instruction || typeof instruction !== "string" || !instruction.trim()) {
    return NextResponse.json({ error: "instruction is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase
    .from("deal_packets")
    .select("packet")
    .eq("id", deal_packet_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const props = (dp.packet as DealPacket).properties ?? [];
  const summary = props.map((p, i) => ({
    index: i,
    label: p.address ?? p.suburb ?? `Property ${i + 1}`,
    per_room: p.rent_basis.per_room,
    rooms: p.rent_basis.rooms ?? p.specs?.bedrooms ?? null,
    room_rent: p.rent_basis.room_rent ?? null,
    weekly_rent: p.rent_basis.weekly_rent,
    price: p.specs?.total_price ?? null,
  }));

  let parsed: { edits?: Array<{ property_index?: number; field: string; value?: number }>; extra_info?: string };
  try {
    const text = await orText({
      model: MODELS.fast,
      maxTokens: 700,
      thinking: false,
      system: SYSTEM,
      user: `PROPERTIES:\n${JSON.stringify(summary, null, 2)}\n\nINSTRUCTION:\n"${instruction.trim()}"`,
    });
    parsed = JSON.parse(extractJson(text));
  } catch {
    return NextResponse.json({ error: "Couldn't interpret that — try the editable fields, or reword." }, { status: 502 });
  }

  // Validate + enrich. Drop anything that doesn't map cleanly onto a real field.
  const edits: Array<{
    property_index: number;
    label: string;
    field: string;
    detail: string;
    apply: { index: number; per_room_rent?: number; weekly_rent?: number; price?: number };
  }> = [];
  for (const e of parsed.edits ?? []) {
    const i = Number(e?.property_index);
    const field = e?.field;
    const value = Number(e?.value);
    if (!Number.isInteger(i) || i < 0 || i >= props.length) continue;
    if (!["room_rent", "weekly_rent", "price"].includes(field)) continue;
    if (!isFinite(value) || value <= 0) continue;
    const p = props[i];
    const label = p.address ?? p.suburb ?? `Property ${i + 1}`;

    if (field === "room_rent") {
      if (!p.rent_basis.per_room) continue; // not a co-living property — ignore
      const rooms = p.rent_basis.rooms ?? p.specs?.bedrooms ?? 0;
      edits.push({
        property_index: i, label, field,
        detail: `${AUD(p.rent_basis.room_rent)} → ${AUD(value)} per room${rooms ? ` (${AUD(value * rooms)}/wk across ${rooms})` : ""}`,
        apply: { index: i, per_room_rent: value },
      });
    } else if (field === "weekly_rent") {
      if (p.rent_basis.per_room) continue; // co-living rent is per-room; ignore a weekly figure
      edits.push({
        property_index: i, label, field,
        detail: `${AUD(p.rent_basis.weekly_rent)} → ${AUD(value)}/wk`,
        apply: { index: i, weekly_rent: value },
      });
    } else {
      edits.push({
        property_index: i, label, field,
        detail: `${AUD(p.specs?.total_price ?? null)} → ${AUD(value)}`,
        apply: { index: i, price: value },
      });
    }
  }

  const extra_info = typeof parsed.extra_info === "string" ? parsed.extra_info.trim() : "";

  // Review the operator's RAW input — not just the parsed note — so a risky claim
  // ("guaranteed returns", "can't lose") is caught even if the parser didn't route
  // it into extra_info. The suggestion is a compliant rewrite to offer back.
  let compliance: { violations: Violation[]; suggestion: string } = { violations: [], suggestion: "" };
  try {
    const r = await reviewDealNote(instruction.trim());
    compliance = { violations: r.violations, suggestion: r.suggestion };
  } catch { /* reviewer unavailable — return no violations rather than block */ }

  return NextResponse.json({ ok: true, edits, extra_info, compliance });
}
