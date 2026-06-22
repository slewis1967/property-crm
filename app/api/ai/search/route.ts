/**
 * Two-stage semantic search across contacts.
 *
 * Stage 1: Claude parses the natural-language query into structured filters
 *          (state, buyer_type, budget bounds, temperature, tags, days-since-
 *          contact, free-text terms).
 * Stage 2: those filters apply as Supabase WHERE clauses to fetch up to
 *          ~80 candidates; Claude then ranks the top 10 with rationale.
 *
 * Output: { ok, results: [{contact_id, name, rationale}], filters_applied,
 *           candidate_count }
 *
 * NB: we cap candidates at 80 so the rank prompt stays bounded. If a query is
 * extremely broad (e.g. "all contacts"), the cap means the rank stage only
 * sees the most-recent 80 by updated_at.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { orSafe } from "../../../../utils/postgrest-safe";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const PARSE_SYSTEM = `You translate a property advisor's natural-language search query into structured filters for the CRM contacts table.

Output STRICT JSON only — no preamble, no markdown fences:
{
  "state": "<2-letter state, uppercase>" | null,        // e.g. "QLD", "NSW", "VIC"
  "buyer_type": "<one of: Investor | First Home Buyer | Home Buyer | SMSF Buyer | Downsizer | NDIS | Business Contact>" | null,
  "budget_min": <number or null>,
  "budget_max": <number or null>,
  "temperature": "hot" | "warm" | "cold" | null,
  "tags_any": ["<lowercase tag>", ...],                  // contact must have ANY of these
  "tags_all": ["<lowercase tag>", ...],                  // contact must have ALL of these
  "min_days_since_contact": <int or null>,               // for "not contacted in N days"
  "max_days_since_contact": <int or null>,               // for "contacted in last N days"
  "free_text": "<terms to match in name/notes/email>" | null,
  "limit": <int 1-50>                                     // how many to return; default 10
}

Rules:
- Only set fields the query explicitly or strongly implies. Default everything else to null / [].
- Australian states: QLD, NSW, VIC, WA, SA, TAS, ACT, NT.
- Budgets: parse "$700k" → 700000, "between 500 and 700k" → min=500000, max=700000.
- Heat words: hot, warm, cold are temperature signals. "engaged"/"active" → hot.
- "FHB" → "First Home Buyer". "NDIS" / "SDA" → "NDIS". "investor" / "smsf" map naturally.
- "not contacted in 30 days" → min_days_since_contact = 30.
- "stale" / "cold leads" — set temperature=cold OR min_days_since_contact=30.
- For tags: "tagged X", "in the X group", "from getahome" — lowercase the value.
- limit defaults to 10. Only use a higher value if the query asks for "all" or "list every".`;

const RANK_SYSTEM = `You're filtering a candidate list of contacts down to the ones that best match Sean's natural-language query, and writing a one-line rationale per match.

Input: the original query + a list of candidate contacts (already pre-filtered by structured rules).
Output STRICT JSON only — no preamble, no markdown fences:
{ "results": [ { "contact_id": "<uuid>", "name": "<name>", "rationale": "<one short sentence>" }, ... ] }

Rules:
- Rank the strongest matches first, omit clear non-matches.
- Rationale must reference a SPECIFIC fact (state, budget, buyer type, recent activity, tag) — not "good fit".
- If no candidate clearly matches, return { "results": [] }.
- Respect the implicit limit from the query (e.g. "top 5" → at most 5 results). Default to 10.`;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { query } = await req.json();
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ ok: false, error: "query required" }, { status: 400 });
    }
    const q = query.trim();

    // Stage 1: parse to filters
    let filters: any = {};
    try {
      const parseRaw = await aiCall({
        system: PARSE_SYSTEM,
        user: `Today's date: ${new Date().toISOString().slice(0, 10)}\n\nQuery:\n${q}`,
        maxTokens: 1200,
        effort: "medium",
      });
      const m = parseRaw.match(/\{[\s\S]*\}/);
      if (m) filters = JSON.parse(m[0]);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: `Failed to parse query: ${e?.message ?? "unknown"}` },
        { status: 500 },
      );
    }

    // Stage 2: apply filters → fetch candidates
    let qb = supabase
      .from("contacts")
      .select(
        "id,name,full_name,email,phone,buyer_type,preferred_state,state,budget,budget_min,budget_max,temperature,lead_score,status,timeframe,finance_status,tags,updated_at,notes",
      )
      .order("updated_at", { ascending: false })
      .limit(80);

    if (filters.state) {
      const s = orSafe(String(filters.state));
      if (s) qb = qb.or(`preferred_state.ilike.${s},state.ilike.${s}`);
    }
    if (filters.buyer_type) qb = qb.eq("buyer_type", filters.buyer_type);
    if (typeof filters.temperature === "string") qb = qb.eq("temperature", filters.temperature);
    if (typeof filters.budget_min === "number")
      qb = qb.gte("budget_max", filters.budget_min);
    if (typeof filters.budget_max === "number")
      qb = qb.lte("budget_max", filters.budget_max);
    if (Array.isArray(filters.tags_any) && filters.tags_any.length > 0)
      qb = qb.overlaps("tags", filters.tags_any);
    if (Array.isArray(filters.tags_all) && filters.tags_all.length > 0)
      qb = qb.contains("tags", filters.tags_all);
    if (typeof filters.min_days_since_contact === "number") {
      const cutoff = new Date(
        Date.now() - filters.min_days_since_contact * 86400_000,
      ).toISOString();
      qb = qb.lt("updated_at", cutoff);
    }
    if (typeof filters.max_days_since_contact === "number") {
      const cutoff = new Date(
        Date.now() - filters.max_days_since_contact * 86400_000,
      ).toISOString();
      qb = qb.gte("updated_at", cutoff);
    }
    if (typeof filters.free_text === "string" && filters.free_text.trim()) {
      const term = orSafe(filters.free_text);
      if (term) {
        qb = qb.or(
          `name.ilike.%${term}%,full_name.ilike.%${term}%,email.ilike.%${term}%,notes.ilike.%${term}%`,
        );
      }
    }

    const { data: candidates, error } = await qb;
    if (error) {
      return NextResponse.json(
        { ok: false, error: `DB query failed: ${error.message}`, filters_applied: filters },
        { status: 500 },
      );
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        ok: true,
        results: [],
        filters_applied: filters,
        candidate_count: 0,
      });
    }

    const requestedLimit =
      typeof filters.limit === "number" && filters.limit > 0 && filters.limit <= 50
        ? filters.limit
        : 10;

    // Stage 3: AI ranks + writes rationale
    const rankInput = [
      `QUERY: ${q}`,
      `Return up to ${requestedLimit} matches.`,
      "",
      `CANDIDATES (${candidates.length}):`,
      ...candidates.map((c: any) =>
        [
          `- id: ${c.id}`,
          `  name: ${c.full_name || c.name || "(unnamed)"}`,
          `  buyer_type: ${c.buyer_type || "—"}`,
          `  state: ${c.preferred_state || c.state || "—"}`,
          `  budget: ${c.budget_max || c.budget || "—"}`,
          `  temperature: ${c.temperature || "—"} · score: ${c.lead_score ?? "—"} · status: ${c.status || "—"}`,
          `  finance: ${c.finance_status || "—"} · timeframe: ${c.timeframe || "—"}`,
          `  tags: ${Array.isArray(c.tags) ? c.tags.join(", ") : "—"}`,
          `  updated: ${c.updated_at}`,
          c.notes ? `  notes: ${truncate(c.notes, 180)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    ].join("\n");

    let results: Array<{ contact_id: string; name: string; rationale: string }> = [];
    try {
      const rankRaw = await aiCall({
        system: RANK_SYSTEM,
        user: rankInput,
        maxTokens: 3000,
        effort: "medium",
      });
      const m = rankRaw.match(/\{[\s\S]*\}/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed?.results)) results = parsed.results;
      }
    } catch (e: any) {
      return NextResponse.json(
        {
          ok: false,
          error: `Rank stage failed: ${e?.message ?? "unknown"}`,
          filters_applied: filters,
          candidate_count: candidates.length,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      results,
      filters_applied: filters,
      candidate_count: candidates.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Search failed" },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
