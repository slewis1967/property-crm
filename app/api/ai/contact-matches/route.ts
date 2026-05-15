import { NextResponse } from "next/server";
import { nexusApi } from "../../../../utils/nexus-api";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const SYSTEM = `You match a property buyer to the available stock that fits them best. Sean is a property advisor at NextKey Property Strategists; you're picking which 5 properties to send this contact.

Input: one contact + a candidate list of pre-filtered properties (already roughly compatible by state and budget). The contact may also have a preferred_location (a city/suburb/region they want to buy in) and free-text notes that may override default location preferences.

LOCATION RULES — apply in this order:
1. If buyer_type is "Owner Occupier" or "First Home Buyer" they want to LIVE in the property. Default rule: bias strongly toward properties in or geographically near their preferred_location. If preferred_location is blank, use the contact's state. Their notes/message may explicitly contradict this — e.g. "lives in Perth but wants to buy in Adelaide" → in that case suggest properties in Adelaide instead. ALWAYS read the notes for an explicit location override before applying the default.
2. If buyer_type is "Investor", "SDA", "SMSF" or "Downsizer" — proximity is much less important; apply normal "best fit" logic without strict location bias.

Pick the top 5 properties ordered by best fit first. For each, write a 1-line rationale anchored in specific contact + property facts (don't say "good fit" — say WHY: budget alignment, bedroom count matches needs, builder reputation, NDIS-suitability, location proximity for OO/FHB, etc.).

Output STRICT JSON only — no preamble, no markdown fences. Format:
{"matches":[{"property_id":"<id>","summary":"<short property descriptor>","rationale":"<one sentence>"}]}

If fewer than 5 candidates clearly fit, return only the ones that do. If none fit, return {"matches":[]}.`;

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
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

    // Pull preferred_location from any opportunity linked to this contact
    // (most-recent first). Lets the matchmaker know "buy here" overrides
    // the default state filter for OO/FHB.
    let preferredLocation: string | null = null;
    let buyerTypeFromLeads: string | null = null;
    let leadNotes: string | null = null;
    try {
      const r = await nexusApi("/api/leads", { cache: "no-store" });
      if (r.ok) {
        const { leads } = await r.json();
        const linked = (leads || []).filter((l: any) => {
          if (l.email && contact.email && l.email.toLowerCase() === contact.email.toLowerCase()) return true;
          if (l.primary_contact_id === contactId) return true;
          try {
            const ids = l.linked_contact_ids ? JSON.parse(l.linked_contact_ids) : [];
            return Array.isArray(ids) && ids.includes(contactId);
          } catch { return false; }
        });
        // Most recent first (already ordered by API but defensive)
        linked.sort((a: any, b: any) => (b.created_at || "").localeCompare(a.created_at || ""));
        for (const l of linked) {
          if (l.preferred_location && !preferredLocation) preferredLocation = l.preferred_location;
          if (l.buyer_type && !buyerTypeFromLeads) buyerTypeFromLeads = l.buyer_type;
          if (l.message && !leadNotes) leadNotes = l.message;
          if (preferredLocation && buyerTypeFromLeads && leadNotes) break;
        }
      }
    } catch {
      // Non-fatal — matchmaker still works without lead context.
    }
    const buyerType = contact.buyer_type || buyerTypeFromLeads || null;

    // Pre-filter: state + price headroom
    let q = supabase
      .from("global_stock_pool")
      .select(
        "id,builder_name,street_address,suburb,state,total_package_price,house_price,bedrooms,bathrooms,car_spaces,land_size,house_size,status,property_type,sda_category,created_at,updated_at",
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
      `buyer_type: ${buyerType || "—"}`,
      `state pref: ${state || "—"}`,
      `preferred_location: ${preferredLocation || "—"}`,
      `budget: ${ceiling || "—"}`,
      `finance: ${contact.finance_status || "—"} · timeframe: ${contact.timeframe || "—"}`,
      `temperature: ${contact.temperature || "—"} · status: ${contact.status || "—"}`,
      contact.notes ? `notes: ${truncate(contact.notes, 400)}` : "",
      leadNotes ? `lead_notes: ${truncate(leadNotes, 400)}` : "",
      "",
      `CANDIDATES (${filtered.length}):`,
      ...filtered.map((p: any) => {
        const price = Number(p.total_package_price ?? p.house_price ?? 0);
        return [
          `- id: ${p.id}`,
          `  ${p.street_address || "—"}, ${p.suburb || "—"} ${p.state || "—"}`,
          `  $${price.toLocaleString()} · ${p.bedrooms ?? "—"}br/${p.bathrooms ?? "—"}ba · land ${p.land_size ?? "—"} · house ${p.house_size ?? "—"}`,
          `  builder: ${p.builder_name || "—"} · type: ${p.property_type || "—"}${p.sda_category ? ` · sda: ${p.sda_category}` : ""} · status: ${p.status || "—"}`,
        ].join("\n");
      }),
    ]
      .filter(Boolean)
      .join("\n");

    const fingerprintInput = {
      v: 2,
      contact_updated: contact.updated_at ?? null,
      contact_budget: ceiling,
      contact_state: state,
      preferred_location: preferredLocation,
      buyer_type: buyerType,
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
