import { MODELS, orText } from "./openrouter";
import { getCachedOrGenerate } from "./ai-cache";
import { recall } from "./memory";
import type { MarketData } from "./deal-packet";

/**
 * The persuasive INVESTMENT CASE baked into deal-analyser reports — "why buy a
 * [property type] in [suburb]". This is a SALES document (we're selling the
 * property), so the compliance guardrails in the prompt matter: compelling and
 * benefit-led, but true — no guarantees, growth framed as past performance,
 * general information only, NextKey branding (never a personal name).
 *
 * Cached 7 days by type+suburb+state (the case is stable per type+location), so
 * regenerating a report is free.
 */
const MODEL = MODELS.fast;

const SYSTEM = `You write the persuasive INVESTMENT CASE — "why buy a [TYPE] in [SUBURB]" — for a
NextKey Property Strategists client report. Goal: help the client see the opportunity and move toward
a purchase, while staying scrupulously compliant. This is a sales document, so be careful.

HARD RULES:
- NextKey branding only — NEVER use a personal name.
- Compelling and benefit-led, but TRUE. No "guaranteed", "can't lose", "risk-free", "set and forget",
  or specific future-return promises (Australian Consumer Law s.18/s.29 — misleading conduct).
- Any growth/yield figures are sourced/dated PAST performance, framed as such — never a forecast.
- General information only — not personal financial, credit or taxation advice (NextKey isn't licensed).
- Stay balanced: a brief, honest "what to weigh" builds trust and keeps it compliant.

STRUCTURE (use ** bold mini-headings; tight prose + a few bullets):
**Why [type]** — the investment characteristics of THIS property type: income structure, demand drivers,
  tenant pool, depreciation/tax-effectiveness, resilience. Be specific to the type — co-living = multiple
  income streams + housing-affordability demand; NDIS/SDA = government-backed, high-needs demand; apartment
  = affordability + lifestyle + rental depth; house & land = land appreciation + depreciation + family demand;
  dual occupancy = two incomes from one title; etc.
**Why [suburb]** — how this location amplifies it: rental demand, population/growth drivers, infrastructure,
  demographics that suit this type.
**Who it suits** — the investor profile and strategy this fits (cashflow vs growth, portfolio stage).

~220–300 words. Confident, professional, client-ready. No preamble, no closer, no disclaimer.`;

function weekBucket(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}

export async function getInvestmentThesis(args: {
  propertyType: string;
  suburb: string | null;
  state: string | null;
  market?: MarketData | null;
}): Promise<string | null> {
  const { propertyType, suburb, state, market } = args;
  if (!suburb || !propertyType) return null;

  const grounding = [
    market?.median_house_price?.reconciled ? `median price: $${market.median_house_price.reconciled.toLocaleString("en-AU")}` : "",
    market?.capital_growth_12m_pct?.reconciled != null ? `12-mo growth (past): ${market.capital_growth_12m_pct.reconciled}%` : "",
    market?.median_rent_pw ? `median rent: $${market.median_rent_pw}/wk` : "",
    market?.vacancy_rate_pct != null ? `vacancy: ${market.vacancy_rate_pct}%` : "",
    market?.population ? `population: ${market.population.toLocaleString("en-AU")}` : "",
  ].filter(Boolean).join("\n");

  // Fold Sean's CURATED KNOWLEDGE for this type/location into the prompt so the
  // case reflects NextKey's house positioning and accumulated angles. Knowledge
  // ONLY — never raw learnings / contact memory in a client-facing document. The
  // compliance HARD RULES in SYSTEM still bind. Best-effort; empty on any error.
  let knowledge: { title: string; body: string }[] = [];
  try {
    const mems = await recall(`${propertyType} ${suburb}${state ? ` ${state}` : ""}`, {
      kind: "knowledge",
      limit: 4,
      feature: "investment-thesis",
    });
    knowledge = mems.map((m) => ({ title: m.title, body: m.body }));
  } catch {
    /* non-fatal — generate without it */
  }
  const knowledgeBlock = knowledge.length
    ? "\n\nNextKey positioning notes (internal — use to inform angle/tone, keep compliant, " +
      "do NOT quote verbatim):\n" +
      knowledge.map((k) => `- ${k.title}: ${k.body}`).join("\n")
    : "";

  try {
    const res = await getCachedOrGenerate({
      kind: "investment-thesis",
      refId: `${propertyType}:${state ?? ""}:${suburb}`.toLowerCase(),
      // knowledgeKey busts the 7-day cache when the relevant curated knowledge changes.
      fingerprintInput: {
        v: 1,
        propertyType,
        suburb,
        state: state ?? null,
        week: weekBucket(),
        knowledgeKey: knowledge.map((k) => k.title).join("|"),
      },
      maxAgeMs: 7 * 24 * 60 * 60 * 1000,
      generate: async () => {
        let text = await orText({
          model: MODEL,
          maxTokens: 1500,
          web: true,
          thinking: false,
          system: SYSTEM,
          user: `Write the NextKey investment case for buying a ${propertyType} in ${suburb}${state ? `, ${state}` : ""}.\n\nKnown suburb data (verify/extend with web search):\n${grounding || "(none — research it)"}${knowledgeBlock}`,
        });
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
