import { NextRequest, NextResponse } from "next/server";
import { MODELS, orText } from "@/utils/openrouter";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import type { DealPacket, AssumptionSource } from "@/utils/deal-packet";

/**
 * POST /api/deal-analyser/research  { deal_packet_id, index }
 *
 * Uses Claude + web search to fill the FACTUAL current cost inputs for one property:
 * investment loan interest rate, stamp/transfer duty (by state + price), typical
 * council rates, and landlord insurance. Returns the figures + a citation
 * (source + date) for each — the report shows these as sourced.
 *
 * Deliberately does NOT research capital/rental GROWTH: projecting researched growth
 * forward is the ACL s.18/29 risk the compliance split exists to avoid. Growth stays
 * the conservative house default unless the operator sets it by hand.
 */
const MODEL = MODELS.fast;

const SYSTEM = `You research current Australian property-investment COST figures using web search,
for use in a cashflow model. You never research or estimate capital growth, rental growth, or
future returns — only present-day costs. Be specific and cite a real source + date for each figure.

After searching, output ONLY a strict JSON object (no prose, no code fences):
{
  "interestRate": <number, % p.a. — current average variable rate for a residential INVESTMENT loan>,
  "stampDuty": <number, AUD — transfer/stamp duty for an INVESTMENT purchase at this price in this state>,
  "rates": <number, AUD/year — typical council rates for this area>,
  "insurance": <number, AUD/year — typical landlord insurance premium for this property>,
  "sources": [
    {"field":"interestRate","label":"Investment loan interest rate","value":<num>,"source":"<publisher>","date":"<e.g. May 2026>"},
    {"field":"stampDuty","label":"Stamp duty (<STATE>, investment)","value":<num>,"source":"<state revenue office>","date":"<year>"},
    {"field":"rates","label":"Council rates","value":<num>,"source":"<source>","date":"<period>"},
    {"field":"insurance","label":"Landlord insurance","value":<num>,"source":"<source>","date":"<period>"}
  ]
}
Determine the state from the suburb/address. If you can't find a figure, omit it from both the top level
and sources rather than guessing.`;

function extractJson(text: string): any | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { deal_packet_id, index, contract_type, land_price } = await req.json().catch(() => ({}));
  if (!deal_packet_id || typeof deal_packet_id !== "string") {
    return NextResponse.json({ error: "deal_packet_id is required" }, { status: 400 });
  }

  const { data: dp, error } = await supabase.from("deal_packets").select("packet").eq("id", deal_packet_id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dp) return NextResponse.json({ error: "deal_packet not found" }, { status: 404 });

  const props = (dp.packet as DealPacket).properties ?? [];
  const i = Number(index);
  const p = props[i];
  if (!p) return NextResponse.json({ error: `no property at index ${index}` }, { status: 400 });

  const where = [p.address, p.suburb].filter(Boolean).join(", ") || "Australia";
  const price = p.specs?.total_price ?? null;
  const isDual = contract_type === "dual";
  const dutyBase = isDual ? (Number(land_price) || p.specs?.land_price || null) : price;
  const dutyClause = isDual
    ? `This is a DUAL (split land + build) contract — calculate transfer/stamp duty on the LAND value ONLY${dutyBase ? ` (~$${dutyBase.toLocaleString("en-AU")})` : ""}, not the full package, and label that figure "Stamp duty (land only, <state>)".`
    : `This is a SINGLE contract — calculate transfer/stamp duty on the full purchase price${price ? ` (~$${price.toLocaleString("en-AU")})` : ""}.`;
  const prompt = `Property: ${where}${price ? ` · purchase price ~$${price.toLocaleString("en-AU")}` : ""}. ` +
    `${dutyClause} ` +
    `Research the current investment loan interest rate, that stamp duty, typical council rates, and typical landlord insurance. Output the strict JSON only.`;

  let parsed: any = null;
  try {
    const text = await orText({
      model: MODEL,
      maxTokens: 1500,
      web: true,
      thinking: false,
      system: SYSTEM,
      user: prompt,
    });
    parsed = extractJson(text);
  } catch (e: any) {
    return NextResponse.json({ error: `research failed: ${e?.message ?? "web search error"}` }, { status: 502 });
  }
  if (!parsed) return NextResponse.json({ error: "couldn't parse researched figures — try again" }, { status: 502 });

  // Whitelist + coerce. Only these PiaInputs cost fields are researchable.
  const FIELDS: { key: keyof typeof parsed; label: string }[] = [
    { key: "interestRate", label: "Investment loan interest rate" },
    { key: "stampDuty", label: "Stamp duty" },
    { key: "rates", label: "Council rates" },
    { key: "insurance", label: "Landlord insurance" },
  ];
  const figures: Record<string, number> = {};
  for (const f of FIELDS) {
    const v = Number(parsed[f.key]);
    if (isFinite(v) && v > 0) figures[f.key as string] = v;
  }
  const srcByField = new Map<string, any>();
  for (const s of Array.isArray(parsed.sources) ? parsed.sources : []) {
    if (s && typeof s.field === "string") srcByField.set(s.field, s);
  }
  const sources: AssumptionSource[] = Object.keys(figures).map((field) => {
    const s = srcByField.get(field);
    const label = FIELDS.find((f) => f.key === field)?.label ?? field;
    return {
      field,
      label: typeof s?.label === "string" ? s.label.slice(0, 120) : label,
      value: figures[field],
      source: typeof s?.source === "string" ? s.source.slice(0, 120) : "Web research",
      date: typeof s?.date === "string" ? s.date.slice(0, 40) : new Date().toLocaleDateString("en-AU"),
    };
  });

  return NextResponse.json({ ok: true, figures, sources });
}
