import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";

export const dynamic = "force-dynamic";

const SYSTEM = `You match a property buyer to the available stock that fits them best. Sean is a property advisor at NextKey Property Strategists; you're picking which 5 properties to send this contact.

Input: one contact + a candidate list of pre-filtered properties (already roughly compatible by state and budget).

Pick the top 5 properties ordered by best fit first. For each, write a 1-line rationale anchored in specific contact + property facts (don't say "good fit" — say WHY: budget alignment, bedroom count matches needs, builder reputation, NDIS-suitability, etc.).

Output STRICT JSON only — no preamble, no markdown fences. Format:
{"matches":[{"property_id":"<id>","summary":"<short property descriptor>","rationale":"<one sentence>"}]}

If fewer than 5 candidates clearly fit, return only the ones that do. If none fit, return {"matches":[]}.`;

export async function POST(req: Request) {
  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
    }

    let contact: any;
    const { data: liveContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    if (liveContact) {
      contact = liveContact;
    } else {
      const { data: archive } = await supabase
        .from("ghl_archive_contacts")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (!archive) {
        return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
      }
      contact = {
        ...archive,
        name:
          archive.contact_name ||
          `${archive.first_name || ""} ${archive.last_name || ""}`.trim() ||
          null,
        preferred_state: archive.state ?? null,
      };
    }

    const ceiling = contact.budget_max || contact.budget || null;
    const state = contact.preferred_state || contact.state || null;

    // Pre-filter: state + price headroom
    let q = supabase
      .from("global_stock_pool")
      .select(
        "id,builder_name,street_address,suburb,state,total_package_price,house_price,bedrooms,bathrooms,car_spaces,land_size,house_size,status,category,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (state) q = q.ilike("state", state);

    const { data: candidates, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const filtered = (candidates ?? []).filter((p: any) => {
      const price = Number(p.total_package_price ?? p.house_price ?? 0);
      if (!price) return true;
      if (!ceiling) return true;
      return price <= Number(ceiling) * 1.1;
    });

    if (filtered.length === 0) {
      return NextResponse.json({ ok: true, matches: [], cached: false });
    }

    const userPrompt = [
      "CONTACT:",
      `name: ${contact.full_name || contact.name || "(unnamed)"}`,
      `buyer_type: ${contact.buyer_type || "—"}`,
      `state pref: ${state || "—"}`,
      `budget: ${ceiling || "—"}`,
      `finance: ${contact.finance_status || "—"} · timeframe: ${contact.timeframe || "—"}`,
      `temperature: ${contact.temperature || "—"} · status: ${contact.status || "—"}`,
      contact.notes ? `notes: ${truncate(contact.notes, 400)}` : "",
      "",
      `CANDIDATES (${filtered.length}):`,
      ...filtered.map((p: any) => {
        const price = Number(p.total_package_price ?? p.house_price ?? 0);
        return [
          `- id: ${p.id}`,
          `  ${p.street_address || "—"}, ${p.suburb || "—"} ${p.state || "—"}`,
          `  $${price.toLocaleString()} · ${p.bedrooms ?? "—"}br/${p.bathrooms ?? "—"}ba · land ${p.land_size ?? "—"} · house ${p.house_size ?? "—"}`,
          `  builder: ${p.builder_name || "—"} · category: ${p.category || "—"} · status: ${p.status || "—"}`,
        ].join("\n");
      }),
    ]
      .filter(Boolean)
      .join("\n");

    const fingerprintInput = {
      v: 1,
      contact_updated: contact.updated_at ?? null,
      contact_budget: ceiling,
      contact_state: state,
      candidate_ids: filtered.map((p: any) => p.id).sort(),
      candidate_updates: filtered.map((p: any) => `${p.id}:${p.updated_at ?? p.created_at}`).sort(),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "contact-matches",
        refId: contactId,
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

function parseMatches(
  text: string,
): Array<{ property_id: string; summary: string; rationale: string }> {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const obj = JSON.parse(m[0]);
    return Array.isArray(obj?.matches) ? obj.matches : [];
  } catch {
    return [];
  }
}
function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
