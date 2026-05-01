import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";

export const dynamic = "force-dynamic";

const SYSTEM = `You match a property to the contacts in a CRM who are most likely to want it. Sean is a property advisor at NextKey Property Strategists; you're helping him decide who to pitch this property to.

Input: one property + a candidate list of pre-filtered contacts (already roughly compatible by state and budget).

Pick the top 5 contacts ordered by best fit first. For each, write a 1-line rationale anchored in specific contact + property facts (don't say "good fit" — say WHY: budget headroom, buyer type alignment, recent search activity, state preference, etc.).

Output STRICT JSON only — no preamble, no markdown fences. Format:
{"matches":[{"contact_id":"<uuid>","name":"<name>","rationale":"<one sentence>"}]}

If fewer than 5 candidates clearly fit, return only the ones that do. If none fit, return {"matches":[]}.`;

export async function POST(req: Request) {
  try {
    const { propertyId } = await req.json();
    if (!propertyId) {
      return NextResponse.json({ ok: false, error: "propertyId required" }, { status: 400 });
    }

    const { data: property } = await supabase
      .from("global_stock_pool")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) {
      return NextResponse.json({ ok: false, error: "Property not found" }, { status: 404 });
    }

    const propPrice = Number(
      property.total_package_price ?? property.house_price ?? 0,
    );
    const propState = property.state || property.address_state || null;

    // Pre-filter contacts: same state + budget headroom (or no budget known)
    let q = supabase
      .from("contacts")
      .select(
        "id,name,full_name,email,buyer_type,preferred_state,state,budget,budget_min,budget_max,temperature,lead_score,status,timeframe,finance_status,updated_at",
      )
      .order("lead_score", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(30);
    if (propState) q = q.or(`preferred_state.ilike.${propState},state.ilike.${propState}`);

    const { data: candidates, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // In-memory budget filter (DB filter complex due to nullable fields)
    const filtered = (candidates ?? []).filter((c: any) => {
      if (!propPrice) return true;
      const ceiling = c.budget_max || c.budget;
      if (!ceiling) return true; // unknown budget — let AI decide
      return Number(ceiling) >= propPrice * 0.85;
    });

    if (filtered.length === 0) {
      return NextResponse.json({ ok: true, matches: [], cached: false });
    }

    const userPrompt = [
      "PROPERTY:",
      `id: ${property.id}`,
      `address: ${property.street_address || "—"}, ${property.suburb || "—"} ${propState || "—"}`,
      `price: $${(propPrice || 0).toLocaleString()}`,
      `bedrooms: ${property.bedrooms ?? "—"} · bathrooms: ${property.bathrooms ?? "—"} · car: ${property.car_spaces ?? "—"}`,
      `land: ${property.land_size ?? "—"} · house: ${property.house_size ?? "—"}`,
      `category: ${property.category || "—"} · builder: ${property.builder_name || "—"}`,
      `status: ${property.status || "—"}`,
      "",
      `CANDIDATES (${filtered.length}):`,
      ...filtered.map((c: any) =>
        [
          `- id: ${c.id}`,
          `  name: ${c.full_name || c.name || "(unnamed)"}`,
          `  buyer_type: ${c.buyer_type || "—"}`,
          `  state pref: ${c.preferred_state || c.state || "—"}`,
          `  budget: ${c.budget_max || c.budget || "—"}`,
          `  finance: ${c.finance_status || "—"} · timeframe: ${c.timeframe || "—"}`,
          `  temperature: ${c.temperature || "—"} · score: ${c.lead_score ?? "—"} · status: ${c.status || "—"}`,
        ].join("\n"),
      ),
    ].join("\n");

    const fingerprintInput = {
      v: 1,
      property_updated: property.updated_at ?? property.created_at ?? null,
      candidate_ids: filtered.map((c: any) => c.id).sort(),
      candidate_updates: filtered.map((c: any) => `${c.id}:${c.updated_at}`).sort(),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "property-matches",
        refId: propertyId,
        fingerprintInput,
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 2000,
            effort: "medium",
          }),
      });
      const parsed = parseMatches(result.text);
      return NextResponse.json({ ok: true, matches: parsed, cached: result.cached });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message ?? "AI request failed" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to find matches" },
      { status: 500 },
    );
  }
}

function parseMatches(text: string): Array<{ contact_id: string; name: string; rationale: string }> {
  // Tolerate stray fences or pre/post text
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[0]);
    return Array.isArray(obj?.matches) ? obj.matches : [];
  } catch {
    return [];
  }
}
