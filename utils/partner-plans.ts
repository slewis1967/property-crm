/**
 * Partner plans as the portal SELLS them: prices, the Elite tier and its AI
 * agents. Pure, so the pricing page, the AI Studio and the tests read one list.
 *
 * What a firm can actually USE is still decided by utils/partner.ts
 * (TIER_DEFINITIONS + canUse). Elite is not in PARTNER_TIERS yet: the
 * partners.tier check constraint only allows basic/professional/enterprise, and
 * the agents behind it are previews until the social-posting and outreach
 * plumbing is built. So Elite here is a plan on the page, not a tier in the DB.
 *
 * PRICES: every figure the portal shows lives in PLAN_PRICING / ELITE_TERMS
 * below and nowhere else. Change a figure here and every page follows.
 * Sean confirmed Elite, Founding Elite and Enterprise on 18 Nov 2026. Basic,
 * Professional and the 21-day trial are still proposals: while `confirmed` is
 * false the page shows "TBC" beside them.
 */
import { TIER_DEFINITIONS, type PartnerTier } from "./partner";

export type PlanId = PartnerTier | "elite";

/** Column order on the pricing page: Enterprise sits beside Elite as the anchor. */
export const PLAN_ORDER: readonly PlanId[] = ["basic", "professional", "enterprise", "elite"];

export type PlanPrice = {
  /** A$ per month excluding GST. 0 = free. */
  monthly: number;
  /** A later price already flagged (Professional: free now, $99 later). */
  laterMonthly: number | null;
  /** One-off setup fee, A$. */
  setup: number | null;
  /** AI usage included in the monthly price, A$. Elite only. */
  aiIncluded: number | null;
  /** False until Sean confirms; the page shows "TBC". */
  confirmed: boolean;
  /** When the setup fee is waived (Enterprise). */
  setupWaiver: string | null;
};

/** THE price list. A$, excl. GST. Elite and Enterprise confirmed by Sean 18 Nov 2026. */
export const PLAN_PRICING: Record<PlanId, PlanPrice> = {
  basic: { monthly: 0, laterMonthly: null, setup: null, aiIncluded: null, confirmed: false, setupWaiver: null },
  professional: { monthly: 0, laterMonthly: 99, setup: null, aiIncluded: null, confirmed: false, setupWaiver: null },
  enterprise: {
    monthly: 399,
    laterMonthly: null,
    setup: 1500,
    aiIncluded: null,
    confirmed: true,
    setupWaiver: "Setup waived when your client's hold is backed by a deposit",
  },
  elite: { monthly: 699, laterMonthly: null, setup: null, aiIncluded: 150, confirmed: true, setupWaiver: null },
};

/** Elite's commercial terms. Prices, overage, cap and annual billing confirmed 18 Nov; the trial is not. */
export const ELITE_TERMS = {
  /** Annual billing: pay this many months, get 12. */
  annualMonthsPaid: 10,
  /** Founding Elite: this price for the first N firms, locked for M months. */
  foundingMonthly: 499,
  foundingPlaces: 10,
  /** Founding places already taken. Updated by hand until it comes from the DB. */
  foundingPlacesTaken: 0,
  foundingLockMonths: 12,
  /** AI usage beyond the included allowance is billed at cost times this. */
  overageMultiplier: 1.3,
  /** The partner sets a hard monthly cap; alerts fire at these fractions of it. */
  capAlerts: [0.5, 0.8, 1] as readonly number[],
  /** Trial: length in days, no card; a trial firm that doesn't continue drops to this plan. */
  trialDays: 21,
  trialFallsBackTo: "professional" as PlanId,
  /** Prices, founding offer, overage, cap, annual billing: confirmed by Sean 18 Nov 2026. */
  confirmed: true,
  /** The 21-day no-card trial: NOT confirmed yet. */
  trialConfirmed: false,
} as const;

export const ELITE_TRIAL_DAYS = ELITE_TERMS.trialDays;

export const TRIAL_CTA = `Start your ${ELITE_TERMS.trialDays}-day Elite trial — no card`;

/** Billing wording (platform research, 18 Nov). Never "Claude credits" or "Claude access". */
export const AI_USAGE_LINE = "AI usage, billed monthly";

/** Label required on any artwork that depicts a home (platform research, 18 Nov). */
export const ARTIST_IMPRESSION = "Artist's impression, not the actual property";

export function foundingPlacesLeft(
  terms: { foundingPlaces: number; foundingPlacesTaken: number } = ELITE_TERMS,
): number {
  return Math.max(0, terms.foundingPlaces - terms.foundingPlacesTaken);
}

/** Annual billing as an effective monthly figure (10 months for 12). */
export function annualEffectiveMonthly(monthly: number, monthsPaid: number = ELITE_TERMS.annualMonthsPaid): number {
  return Math.round((monthly * monthsPaid) / 12);
}

/** "50%, 80% and 100%". */
export function capAlertsLabel(alerts: readonly number[] = ELITE_TERMS.capAlerts): string {
  const pct = alerts.map((a) => `${Math.round(a * 100)}%`);
  return pct.length > 1 ? `${pct.slice(0, -1).join(", ")} and ${pct[pct.length - 1]}` : pct.join("");
}

/** "Free" / "$399". */
export function priceLabel(p: Pick<PlanPrice, "monthly">): string {
  return p.monthly === 0 ? "Free" : `$${p.monthly.toLocaleString("en-AU")}`;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export type AgentId = "facebook" | "instagram" | "seo" | "wechat" | "reengage";

export type AgentDef = {
  id: AgentId;
  name: string;
  tagline: string;
  /** What it produces, one line, for the card. */
  produces: string;
  /** How the output reaches the world. Honest about what is and isn't automatic. */
  delivery: string;
  /** Shown as a "Coming soon" chip next to the delivery line. */
  deliveryComingSoon: boolean;
  /** Extra promises shown on the card (compliance, consent). */
  promises: string[];
  /** Gradient stops for the card art (platform-ish hues; the rest is --brand/--accent). */
  hue: [string, string];
};

/**
 * Platform facts from the 18 Nov research:
 *  - Facebook/Instagram: one-tap publish after approval, but Meta app review
 *    takes weeks, so it is "coming soon".
 *  - WeChat and Xiaohongshu (RedNote) cannot be auto-posted by an Australian
 *    company: the agent makes a content pack the partner posts from their
 *    phone. Copy must never say we post to WeChat for them.
 *  - Re-engage sends from the partner's own email and number, in their name,
 *    with unsubscribe handled; the partner approves each message; any AI that
 *    chats with a lead says it is an AI assistant.
 */
export const AI_AGENTS: readonly AgentDef[] = [
  {
    id: "facebook",
    name: "Facebook agent",
    tagline: "Your stock on your page, written for your audience",
    produces: "Page posts with artwork and copy",
    delivery: "One-tap publish to your page after you approve",
    deliveryComingSoon: true,
    promises: ["Nothing posts until you approve"],
    hue: ["#1877f2", "#5b9dff"],
  },
  {
    id: "instagram",
    name: "Instagram agent",
    tagline: "Scroll-stopping posts and captions",
    produces: "Square posts, captions and hashtags",
    delivery: "One-tap publish to your account after you approve",
    deliveryComingSoon: true,
    promises: ["Nothing posts until you approve"],
    hue: ["#f58529", "#dd2a7b"],
  },
  {
    id: "seo",
    name: "Organic & SEO agent",
    tagline: "Suburb guides that rank and bring buyers to you",
    produces: "Blog articles and suburb guides for your website",
    delivery: "Ready to paste into your website, or download",
    deliveryComingSoon: false,
    promises: ["You review every article first"],
    hue: ["#0f9d58", "#34c38f"],
  },
  {
    id: "wechat",
    name: "WeChat & RedNote content pack",
    tagline: "Reach Chinese-speaking buyers in their language",
    produces: "Bilingual copy plus artwork for WeChat and Xiaohongshu (RedNote)",
    delivery: "A content pack you post in one tap from your phone",
    deliveryComingSoon: false,
    promises: ["You post it from your own account", "Nothing goes out until you share it"],
    hue: ["#07c160", "#ff2442"],
  },
  {
    id: "reengage",
    name: "Re-engage agent",
    tagline: "Wakes up your cold and warm leads",
    produces: "Personal follow-ups matched to fresh stock",
    delivery: "Sent from your own email and number, in your name",
    deliveryComingSoon: false,
    promises: [
      "You approve every message",
      "Unsubscribe handled automatically",
      "If a lead replies, the assistant says it's an AI assistant",
    ],
    hue: ["#7c3aed", "#c084fc"],
  },
];

/** Optional channels to add later (shown as "later" cards, no preview). */
export const LATER_CHANNELS: readonly { id: string; name: string; tagline: string }[] = [
  { id: "linkedin", name: "LinkedIn", tagline: "Posts for your professional network" },
  { id: "gbp", name: "Google Business Profile", tagline: "Fresh updates on your Google listing" },
];

export function isAgentId(v: unknown): v is AgentId {
  return typeof v === "string" && AI_AGENTS.some((a) => a.id === v);
}

export function agentDef(id: AgentId): AgentDef {
  return AI_AGENTS.find((a) => a.id === id) as AgentDef;
}

// ── Plan cards ───────────────────────────────────────────────────────────────

export type PlanCard = {
  id: PlanId;
  label: string;
  blurb: string;
  price: PlanPrice;
  /** Cumulative tiers say "Everything in X, plus". */
  includesFrom: PlanId | null;
  highlights: string[];
  maxUsers: number | null;
};

const BLURBS: Record<PlanId, string> = {
  basic: "Everything you need to sell from our stock book.",
  professional: "Client-ready material for a growing team.",
  enterprise: "Your brand, your team, every report.",
  elite: "An AI marketing team that drafts your week and warms your buyers.",
};

const HIGHLIGHTS: Record<PlanId, string[]> = {
  basic: ["Full stock book and map", "Client register", "Hold requests and deal tracking", "Your referral fee on every lot", "AI insights on your dashboard"],
  professional: ["Client-ready lot sheets (PDF)", "Suburb research reports", "Up to 5 team logins"],
  enterprise: ["Portal in your own branding", "Planning feasibility reports", "Unlimited team logins"],
  elite: [
    "Your week, drafted: posts, blog, follow-ups and match packs",
    "Facebook and Instagram agents",
    "Organic and SEO blog agent",
    "WeChat & RedNote content packs",
    "Re-engage agent for cold and warm leads",
    "Nothing goes out until you approve",
  ],
};

export function planCards(): PlanCard[] {
  return PLAN_ORDER.map((id, i) => ({
    id,
    label: id === "elite" ? "Elite" : TIER_DEFINITIONS[id].label,
    blurb: BLURBS[id],
    price: PLAN_PRICING[id],
    includesFrom: i === 0 ? null : PLAN_ORDER[i - 1],
    highlights: HIGHLIGHTS[id],
    maxUsers: id === "elite" ? null : TIER_DEFINITIONS[id].maxUsers,
  }));
}

/** True once a firm can run the agents for real. Always false until Elite exists in the DB. */
export function hasElite(tier: string): boolean {
  return tier === "elite";
}

// ── Annual bonus (Sean, 18 Nov 2026) ─────────────────────────────────────────

/**
 * Pay 12 months upfront on Elite or Enterprise (annual billing, 10 months'
 * price for 12) and get a new search-optimised website, plus a review of the
 * existing one if the firm has a site. Page count is TBC, so none is stated,
 * and no dollar value is put on the website.
 */
export const ANNUAL_WEBSITE_BONUS = {
  appliesTo: ["enterprise", "elite"] as readonly PlanId[],
  headline: "Pay annually, get a new website",
  points: [
    "A new search-optimised website for your firm",
    "Live stock widget and lead capture built in",
    "Hosted by us while you're subscribed",
    "Plus a free review of your current website, if you have one",
  ],
} as const;
