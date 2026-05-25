import { nexusApi } from "./nexus-api";

/**
 * Suburb intelligence (the data behind /suburbs) — median price, growth, population
 * and key infrastructure, enriched in NEXUS DuckDB and served via /api/suburbs.
 * Used to add a client-facing suburb snapshot to deal-analyser reports.
 *
 * Non-fatal: returns null when NEXUS is unreachable or the suburb isn't enriched,
 * so the report just omits the section rather than failing.
 */
export interface SuburbIntel {
  suburb: string;
  state: string;
  median_price: number | null;
  price_growth_pct: number | null;
  population: number | null;
  last_updated: string | null;
  key_infrastructure: string[];
  demographics: string | null;
  summary: string | null;
}

export async function getSuburbIntel(suburb: string | null, state: string | null): Promise<SuburbIntel | null> {
  if (!suburb) return null;
  try {
    const res = await nexusApi("/api/suburbs", { cache: "no-store" });
    if (!res.ok) return null;
    const list = ((await res.json()).suburbs ?? []) as any[];
    const m = list.find(
      (s) =>
        String(s.suburb ?? "").toLowerCase() === suburb.toLowerCase() &&
        (!state || String(s.state ?? "").toUpperCase() === state.toUpperCase()),
    );
    if (!m) return null;
    let infra: string[] = [];
    try {
      const parsed = JSON.parse(m.key_infrastructure ?? "[]");
      if (Array.isArray(parsed)) infra = parsed.slice(0, 8).map(String);
    } catch { /* leave empty */ }
    return {
      suburb: m.suburb,
      state: m.state,
      median_price: m.median_price != null ? Number(m.median_price) : null,
      price_growth_pct: m.price_growth_pct != null ? Number(m.price_growth_pct) : null,
      population: m.population != null ? Number(m.population) : null,
      last_updated: m.last_updated ?? null,
      key_infrastructure: infra,
      demographics: m.demographics ?? null,
      summary: m.summary ?? null,
    };
  } catch {
    return null;
  }
}
