/**
 * Claude for the partner portal: dashboard insights and "Your week, drafted".
 * Server-only.
 *
 * Both start from a deterministic answer (utils/partner-insights.ts,
 * utils/partner-week.ts) and ask Claude to improve the WORDING. Claude gets
 * masked stock facts and counts only: no builder, estate, lot number, address,
 * client name or contact detail. Everything it returns is screened
 * (utils/partner-ai-guard.ts) and any failure falls back to the template, so
 * the partner always gets an answer and never gets a bad one.
 *
 * Caching: one successful result per partner per Brisbane day, held in this process. On
 * Netlify that is per function instance, so a cold start may call Claude again
 * the same day; the cost is a single Haiku call. A shared cache table is noted
 * as a follow-up in the PR rather than built here.
 */
import { aiText, MODELS } from "./anthropic";
import { PORTAL_AI_RULES, screenPartnerAiValue } from "./partner-ai-guard";
import type { DashboardStats, Insight } from "./partner-insights";
import { brisbaneToday } from "./partner-pay";
import { mergeAiCopy, type AiWeekCopy, type WeekDraft } from "./partner-week";

const MAX_CACHE = 500;
const cache = new Map<string, { value: unknown }>();

function cacheGet<T>(key: string): T | undefined {
  return cache.get(key)?.value as T | undefined;
}

function cacheSet(key: string, value: unknown): void {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, { value });
}

/** Test hook. */
export function _clearPartnerAiCache(): void {
  cache.clear();
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in answer");
  return JSON.parse(text.slice(start, end + 1));
}

// ── Insights ────────────────────────────────────────────────────────────────

const INSIGHTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insights"],
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "detail"],
        properties: { id: { type: "string" }, title: { type: "string" }, detail: { type: "string" } },
      },
    },
  },
} as const;

export type InsightsResult = { insights: Insight[]; writer: "ai" | "template"; cached: boolean };

/**
 * Reword and rank the deterministic insights. Claude may only reorder and
 * rephrase: ids it invents are dropped, and links and icons come from the
 * originals.
 */
export async function aiInsights(partnerId: string, base: Insight[], stats: DashboardStats): Promise<InsightsResult> {
  const key = `insights:${partnerId}:${brisbaneToday()}`;
  const hit = cacheGet<InsightsResult>(key);
  if (hit) return { ...hit, cached: true };
  if (!base.length) return { insights: base, writer: "template", cached: false };

  let result: InsightsResult = { insights: base, writer: "template", cached: false };
  try {
    const text = await aiText({
      model: MODELS.fast,
      thinking: false,
      maxTokens: 900,
      jsonSchema: INSIGHTS_SCHEMA as unknown as Record<string, unknown>,
      system:
        `${PORTAL_AI_RULES}\n\n` +
        "You are the insights assistant on a partner's dashboard. Rewrite each insight so it is punchy and useful to a busy property professional. " +
        "Keep every number exactly as given. Keep each title under 70 characters and each detail under 140. Order them most actionable first. Return the same ids.",
      user: JSON.stringify({ stats, insights: base.map(({ id, title, detail }) => ({ id, title, detail })) }),
    });
    const parsed = extractJson(text) as { insights?: { id: string; title: string; detail: string }[] };
    const byId = new Map(base.map((i) => [i.id, i]));
    const rewritten: Insight[] = [];
    for (const r of parsed.insights ?? []) {
      const orig = byId.get(r.id);
      if (!orig || typeof r.title !== "string" || typeof r.detail !== "string") continue;
      const next = { ...orig, title: r.title.slice(0, 90), detail: r.detail.slice(0, 180) };
      // Every number in the rewrite must appear in the original: no invented figures.
      const nums = (s: string) => s.match(/\d[\d,.]*/g) ?? [];
      const allowed = new Set([...nums(orig.title), ...nums(orig.detail)]);
      const invented = [...nums(next.title), ...nums(next.detail)].some((n) => !allowed.has(n));
      rewritten.push(invented || !screenPartnerAiValue([next.title, next.detail]).ok ? orig : next);
      byId.delete(r.id);
    }
    rewritten.push(...byId.values());
    result = { insights: rewritten, writer: "ai", cached: false };
    cacheSet(key, result);
  } catch (e) {
    // Not cached: the next load tries again.
    console.error("[partner-ai] insights fell back to template", e instanceof Error ? e.message : e);
  }
  return result;
}

// ── Your week, drafted ──────────────────────────────────────────────────────

const str = { type: "string" } as const;
const WEEK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["social", "blog", "messages", "match"],
  properties: {
    social: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "headline", "body", "bodyZh", "hashtags"],
        properties: { key: str, headline: str, body: str, bodyZh: str, hashtags: { type: "array", items: str } },
      },
    },
    blog: {
      type: "object",
      additionalProperties: false,
      required: ["title", "intro", "sections"],
      properties: {
        title: str,
        intro: str,
        sections: {
          type: "array",
          items: { type: "object", additionalProperties: false, required: ["heading", "body"], properties: { heading: str, body: str } },
        },
      },
    },
    messages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "subject", "body"],
        properties: { key: str, subject: str, body: str },
      },
    },
    match: { type: "object", additionalProperties: false, required: ["intro"], properties: { intro: str } },
  },
} as const;

const WEEK_SYSTEM = `${PORTAL_AI_RULES}

You are the marketing writer inside a property partner's portal. You are given a week of DRAFTS written from templates, built on masked stock facts. Rewrite each one so it reads like a skilled local marketer wrote it: specific, warm, varied, never salesy or hyped.
- Use ONLY the facts in each draft's "lot" (suburb, state, type, bedrooms, bathrooms, car spaces, sizes, price, ref). Add nothing else about the home or the area.
- social: facebook = 60-110 words, conversational. instagram = short punchy caption, up to 8 hashtags. wechat = an English body AND a natural Simplified Chinese bodyZh for Chinese-speaking buyers; never say anyone will post it to WeChat for them. For non-wechat posts return bodyZh as "".
- blog: a 350-500 word suburb guide in 3-4 sections. Describe only what is available (counts, bedrooms, prices given). No claims about the suburb's future, schools, transport or amenities.
- messages: keep the literal placeholder {first_name}. email = under 120 words with a subject line, signed with the sender exactly as given. sms = under 300 characters, must end with "Reply STOP to opt out." and return subject as "".
- match: one or two sentences introducing the shortlist.
Return every key you were given.`;

export type WeekResult = { draft: WeekDraft; cached: boolean; rejected: number };

export async function aiWeekDraft(
  partnerId: string,
  base: WeekDraft,
  opts: { supplierNames?: readonly string[]; sender: { name: string; firm: string } },
): Promise<WeekResult> {
  const key = `week:${partnerId}:${brisbaneToday()}`;
  const hit = cacheGet<WeekResult>(key);
  if (hit) return { ...hit, cached: true };

  // Masked facts only. Client names stay here: messages travel with {first_name}.
  const payload = {
    sender: opts.sender,
    social: base.social.map((s) => ({ key: s.key, channel: s.channel, lot: s.lot, headline: s.headline, body: s.body, bodyZh: s.bodyZh ?? "" })),
    blog: base.blog && { suburb: base.blog.suburb, state: base.blog.state, lots: base.blog.lots, title: base.blog.title, intro: base.blog.intro, sections: base.blog.sections },
    messages: base.messages.map((m) => ({ key: m.key, warmth: m.warmth, channel: m.channel, lot: m.lot, subject: m.subject ?? "", body: m.body })),
    match: base.match && { brief: base.match.brief, picks: base.match.picks.map((p) => p.lot), intro: base.match.intro },
  };

  let result: WeekResult = { draft: base, cached: false, rejected: 0 };
  try {
    const text = await aiText({
      model: MODELS.fast,
      thinking: false,
      maxTokens: 6000,
      jsonSchema: WEEK_SCHEMA as unknown as Record<string, unknown>,
      system: WEEK_SYSTEM,
      user: JSON.stringify(payload),
    });
    const merged = mergeAiCopy(base, extractJson(text) as AiWeekCopy, { supplierNames: opts.supplierNames });
    if (merged.rejected.length) console.warn("[partner-ai] week drafts kept as template", merged.rejected);
    result = { draft: merged.draft, cached: false, rejected: merged.rejected.length };
    cacheSet(key, result);
  } catch (e) {
    // Not cached: the partner can press the button again.
    console.error("[partner-ai] week draft fell back to template", e instanceof Error ? e.message : e);
  }
  return result;
}
