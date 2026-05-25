import Anthropic from "@anthropic-ai/sdk";
import { getCachedOrGenerate } from "./ai-cache";
import type { MarketData } from "./deal-packet";
import type { SuburbIntel } from "./suburb-intel";

/**
 * Comprehensive, CLIENT-FACING suburb profile baked into deal-analyser reports.
 *
 * Generated with Claude + web search so it's thorough and current even for suburbs
 * not yet in the NEXUS suburb DB, grounded in the email's market data + any NEXUS
 * intel. Cached 7 days per suburb+state, so regenerating a report is free.
 *
 * Compliance is in the system prompt: NextKey-only branding (never a personal name),
 * general information only, growth shown as sourced/dated PAST performance, no
 * guarantees or personal financial advice. The report still appends its footer.
 */
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM = `You write a COMPREHENSIVE, client-facing suburb profile for a property investment
report prepared by NextKey Property Strategists. The reader is a prospective investor client.

HARD RULES:
- Refer to the firm ONLY as "NextKey" or "NextKey Property Strategists". NEVER use a personal name.
- General information only — not personal financial, credit or taxation advice.
- Any price/growth figures are sourced, dated and PAST performance — never a forecast or guarantee.
  Do not write "guaranteed", "can't lose", or specific future-return promises (Australian Consumer
  Law s.18/s.29). No credit or financial-planning advice (NextKey is not licensed for those).
- Be accurate and specific — use web search for current data (median price, recent growth, vacancy,
  population, infrastructure projects, employment, transport, schools, demographics, development).

STRUCTURE (use ** for bold headings; prose + short bullets):
**Overview** — where the suburb is, its character, and why investors look here.
**Market** — median price, recent growth (state the source + period; frame as past performance),
  rental demand / vacancy and yield context.
**Growth drivers & infrastructure** — named projects, transport, employment, population growth, development.
**Lifestyle & community** — demographics, amenities, schools, who lives and rents there.
**Why it suits investors** — a balanced, compliant summary, including any considerations to weigh.

~300–400 words. Professional, client-ready, plain text. No preamble, no closer, no disclaimer
(the report adds its own).`;

function weekBucket(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

export async function getSuburbNarrative(args: {
  suburb: string | null;
  state: string | null;
  market?: MarketData | null;
  intel?: SuburbIntel | null;
}): Promise<string | null> {
  const { suburb, state, market, intel } = args;
  if (!suburb) return null;

  const grounding = [
    `SUBURB: ${suburb}${state ? `, ${state}` : ""}`,
    market?.median_house_price?.reconciled ? `email median price: $${market.median_house_price.reconciled.toLocaleString("en-AU")}` : "",
    market?.capital_growth_12m_pct?.reconciled != null ? `email 12-mo growth (past): ${market.capital_growth_12m_pct.reconciled}%` : "",
    market?.median_rent_pw ? `email median rent: $${market.median_rent_pw}/wk` : "",
    market?.vacancy_rate_pct != null ? `email vacancy: ${market.vacancy_rate_pct}%` : "",
    market?.population ? `email population: ${market.population.toLocaleString("en-AU")}` : "",
    intel?.median_price ? `NEXUS median price: $${intel.median_price.toLocaleString("en-AU")}` : "",
    intel?.price_growth_pct != null ? `NEXUS price growth (past): ${intel.price_growth_pct}%` : "",
    intel?.population ? `NEXUS population: ${intel.population.toLocaleString("en-AU")}` : "",
    intel?.key_infrastructure?.length ? `NEXUS infrastructure: ${intel.key_infrastructure.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await getCachedOrGenerate({
      kind: "suburb-narrative-client",
      refId: `${state ?? ""}:${suburb}`.toLowerCase(),
      fingerprintInput: { v: 2, suburb, state: state ?? null, week: weekBucket() },
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      generate: async () => {
        const client = new Anthropic();
        const resp = await client.messages.create({
          model: MODEL,
          max_tokens: 1800,
          system: SYSTEM,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 4 } as any],
          messages: [{ role: "user", content: `Write the NextKey suburb profile for ${suburb}${state ? `, ${state}` : ""}.\n\nKnown data (verify/extend with web search):\n${grounding}` }],
        });
        let text = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
        // Strip any web-search preamble before the first ** heading, and stray --- rules.
        const firstHeading = text.indexOf("**");
        if (firstHeading > 0) text = text.slice(firstHeading);
        return text.replace(/^\s*-{3,}\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
      },
    });
    return res.text || null;
  } catch {
    return null;
  }
}
