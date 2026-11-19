/**
 * "Your week, drafted": the Elite showcase. Pure, so the dashboard, the AI
 * Studio, the API and the tests share it.
 *
 * Built from the partner's OWN clients plus our MASKED stock: 3 social posts, 1
 * suburb blog post, 5 re-engagement messages and 1 client-brief match pack.
 * `buildWeekDraft` writes every draft from templates, so the preview is real
 * and readable with no AI at all. utils/partner-ai.ts can then ask Claude to
 * rewrite the copy; whatever it returns goes back through `mergeAiCopy`, which
 * screens each draft (brand firewall, masking, claims) and keeps the template
 * for any draft that fails.
 *
 * What may appear in a draft: suburb, state, property type, bedrooms,
 * bathrooms, car spaces, land/home size, price and our NK- reference. Never a
 * builder, estate, lot number, street address, rent, yield, growth or fee.
 * Clients appear only by first name, and only in the partner's own drafts;
 * the AI is sent a placeholder instead of the name.
 */
import { formatAud, type PartnerLot } from "./partner";
import { screenPartnerAiValue } from "./partner-ai-guard";
import { compactAud, isNewThisWeek, lotsForClient } from "./partner-insights";

export type WeekClient = {
  id: string;
  firstName: string;
  state: string | null;
  budgetMax: number | null;
  status: string;
  updatedAt: string;
};

/** The masked facts a draft is allowed to use about a lot. */
export type DraftLot = {
  id: string;
  ref: string;
  suburb: string | null;
  state: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carSpaces: number | null;
  landSizeSqm: number | null;
  houseSizeSqm: number | null;
  price: number | null;
};

export type SocialChannel = "facebook" | "instagram" | "wechat";

export type SocialDraft = {
  key: string;
  channel: SocialChannel;
  lot: DraftLot;
  headline: string;
  body: string;
  /** WeChat/RedNote pack: the Chinese version. */
  bodyZh?: string;
  hashtags: string[];
};

export type BlogDraft = {
  key: "blog";
  suburb: string;
  state: string | null;
  title: string;
  intro: string;
  sections: { heading: string; body: string }[];
  lots: DraftLot[];
};

export type MessageDraft = {
  key: string;
  /** Shown to the partner. A sample lead when the firm has too few clients. */
  clientName: string;
  sample: boolean;
  warmth: "cold" | "warm";
  lastActive: string | null;
  channel: "email" | "sms";
  subject?: string;
  /** Uses {first_name} until `personalise` swaps the name in. */
  body: string;
  lot: DraftLot;
};

export type MatchPackDraft = {
  key: "match";
  clientName: string;
  sample: boolean;
  brief: string;
  intro: string;
  picks: { lot: DraftLot; why: string }[];
};

export type WeekDraft = {
  generatedAt: string;
  /** Who wrote the copy. Not called "source": that key is on the forbidden-key tripwire. */
  writer: "template" | "ai";
  social: SocialDraft[];
  blog: BlogDraft | null;
  messages: MessageDraft[];
  match: MatchPackDraft | null;
  /** Activity-based value only: drafts and the time they'd take by hand. */
  effort: { drafts: number; minutesSaved: number };
};

/** Minutes each draft would take a partner by hand (conservative). Activity-based, no fee maths. */
export const MINUTES_BY_HAND = { social: 20, blog: 90, message: 8, match: 30 } as const;

const SAMPLE_LEADS = ["Alex", "Priya", "Tom", "Mei", "Jordan"];

function toDraftLot(l: PartnerLot): DraftLot {
  return {
    id: l.id,
    ref: l.ref,
    suburb: l.suburb,
    state: l.state,
    propertyType: l.propertyType,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    carSpaces: l.carSpaces,
    landSizeSqm: l.landSizeSqm,
    houseSizeSqm: l.houseSizeSqm,
    price: l.price,
  };
}

export function placeOf(l: Pick<DraftLot, "suburb" | "state">): string {
  return [l.suburb, l.state].filter(Boolean).join(" ") || "your area";
}

function typeWord(l: DraftLot): string {
  const t = (l.propertyType ?? "").toLowerCase();
  if (/apart|unit/.test(t)) return "apartment";
  if (/town|terrace/.test(t)) return "townhouse";
  if (/dual|duplex/.test(t)) return "dual-living home";
  if (/^land$|land only|vacant/.test(t)) return "land";
  return "home";
}

const TYPE_ZH: Record<string, string> = {
  apartment: "公寓",
  townhouse: "联排别墅",
  "dual-living home": "双拼住宅",
  land: "土地",
  home: "独立屋",
};

function bedsWord(l: DraftLot): string {
  return l.bedrooms ? `${l.bedrooms}-bedroom ` : "";
}

function facts(l: DraftLot): string {
  return [
    l.bedrooms && `${l.bedrooms} bed`,
    l.bathrooms && `${l.bathrooms} bath`,
    l.carSpaces && `${l.carSpaces} car`,
    l.landSizeSqm && `${Math.round(l.landSizeSqm)} m² land`,
    l.houseSizeSqm && `${Math.round(l.houseSizeSqm)} m² home`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function hashtag(s: string | null): string | null {
  if (!s) return null;
  const t = s.replace(/[^A-Za-z0-9]/g, "");
  return t ? `#${t}` : null;
}

/** Pick n lots from different suburbs where possible, newest first. */
function diverse(lots: PartnerLot[], n: number): PartnerLot[] {
  const out: PartnerLot[] = [];
  const seen = new Set<string>();
  for (const l of lots) {
    const k = `${l.suburb}|${l.state}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(l);
    if (out.length === n) return out;
  }
  for (const l of lots) {
    if (out.length === n) break;
    if (!out.includes(l)) out.push(l);
  }
  return out;
}

function relativeAge(iso: string, now: Date): string {
  const days = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 86_400_000));
  if (days < 1) return "today";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export function socialTemplate(channel: SocialChannel, lot: DraftLot, firmName: string): Omit<SocialDraft, "key"> {
  const where = placeOf(lot);
  const price = lot.price ? formatAud(lot.price) : null;
  const tags = [hashtag(lot.suburb), hashtag(lot.state), "#NewHome", "#HouseAndLand", "#NewBuild"].filter(Boolean) as string[];
  if (channel === "facebook") {
    return {
      channel,
      lot,
      headline: `Just listed: ${bedsWord(lot)}${typeWord(lot)} in ${where}`,
      body:
        `A brand-new ${bedsWord(lot)}${typeWord(lot)} has just come up in ${where}` +
        `${price ? `, priced at ${price}` : ""}. ${facts(lot)}.\n\n` +
        `Want the full details or a side-by-side with similar homes? Message ${firmName} and quote ${lot.ref}.`,
      hashtags: tags.slice(0, 3),
    };
  }
  if (channel === "instagram") {
    return {
      channel,
      lot,
      headline: `${where} · ${lot.bedrooms ?? ""}${lot.bedrooms ? " bed" : ""} ${typeWord(lot)}`.replace(/\s+/g, " ").trim(),
      body:
        `New in ${where} ✦ ${facts(lot)}${price ? ` ✦ ${price}` : ""}\n\n` +
        `Brand new and ready for its first owners. DM us "${lot.ref}" for the details.`,
      hashtags: tags,
    };
  }
  const zhType = TYPE_ZH[typeWord(lot)] ?? "新房";
  return {
    channel,
    lot,
    headline: `New ${typeWord(lot)} in ${where}`,
    body: `New ${bedsWord(lot)}${typeWord(lot)} in ${where}${price ? `, ${price}` : ""}. ${facts(lot)}. Message us for details, quote ${lot.ref}.`,
    bodyZh:
      `【新房推荐】${where} · ${lot.bedrooms ? `${lot.bedrooms}居室` : ""}${zhType}` +
      `${price ? `，总价 ${price}` : ""}。全新房源，欢迎私信咨询，编号 ${lot.ref}。`,
    hashtags: [hashtag(lot.suburb), "#澳洲新房", "#澳洲买房"].filter(Boolean) as string[],
  };
}

export function blogTemplate(suburb: string, state: string | null, inSuburb: DraftLot[], monthYear: string): BlogDraft {
  const where = [suburb, state].filter(Boolean).join(" ");
  const prices = inSuburb.map((l) => l.price).filter((p): p is number => p !== null).sort((a, b) => a - b);
  const beds = [...new Set(inSuburb.map((l) => l.bedrooms).filter((b): b is number => !!b))].sort((a, b) => a - b);
  const range = prices.length ? `from ${compactAud(prices[0])}${prices.length > 1 ? ` to ${compactAud(prices[prices.length - 1])}` : ""}` : "on request";
  const picks = inSuburb.slice(0, 3);
  return {
    key: "blog",
    suburb,
    state,
    title: `Buying new in ${where}: what's available in ${monthYear}`,
    intro:
      `If you're looking at a brand-new home in ${where}, here's a plain-English snapshot of what's on offer right now. ` +
      `There are ${inSuburb.length} new ${inSuburb.length === 1 ? "home" : "homes"} available, priced ${range}.`,
    sections: [
      {
        heading: "What's on offer",
        body:
          `${beds.length ? `Homes range from ${beds[0]} to ${beds[beds.length - 1]} bedrooms. ` : ""}` +
          `Every one is new, so you choose finishes before the first owner moves in.`,
      },
      {
        heading: "Three homes worth a look",
        body: picks.map((l) => `• ${bedsWord(l)}${typeWord(l)}, ${facts(l)}${l.price ? `, ${formatAud(l.price)}` : ""} (ref ${l.ref})`).join("\n"),
      },
      {
        heading: "Next steps",
        body: "Tell us what you need and we'll shortlist the homes that fit, side by side, before you spend a weekend driving around.",
      },
    ],
    lots: picks,
  };
}

export function messageTemplate(
  warmth: "cold" | "warm",
  lot: DraftLot,
  channel: "email" | "sms",
  sender: { name: string; firm: string },
): { subject?: string; body: string } {
  const where = placeOf(lot);
  const price = lot.price ? ` at ${formatAud(lot.price)}` : "";
  const opener = warmth === "cold" ? "It's been a little while, so I wanted to share something new." : "Following up on our last chat.";
  if (channel === "sms") {
    return {
      body: `Hi {first_name}, ${sender.name} from ${sender.firm}. A new ${bedsWord(lot)}${typeWord(lot)} just came up in ${where}${price}. Want the details? Reply STOP to opt out.`,
    };
  }
  return {
    subject: `A new ${typeWord(lot)} in ${where}`,
    body:
      `Hi {first_name},\n\n${opener} A brand-new ${bedsWord(lot)}${typeWord(lot)} has come up in ${where}${price}: ${facts(lot)}.\n\n` +
      `If it's close to what you're after, reply and I'll send the full details and a couple of alternatives.\n\n${sender.name}\n${sender.firm}`,
  };
}

// ── The week ─────────────────────────────────────────────────────────────────

export function buildWeekDraft(input: {
  lots: PartnerLot[];
  clients: WeekClient[];
  firmName: string;
  senderName: string;
  now: Date;
}): WeekDraft {
  const { now, firmName } = input;
  const sender = { name: input.senderName, firm: firmName };
  const available = input.lots
    .filter((l) => l.availability === "available" && l.suburb && l.price !== null)
    .sort((a, b) => {
      const na = isNewThisWeek(a, now) ? 1 : 0;
      const nb = isNewThisWeek(b, now) ? 1 : 0;
      return nb - na || (b.listedAt ?? b.updatedAt ?? "").localeCompare(a.listedAt ?? a.updatedAt ?? "");
    });

  // Social: three lots from three suburbs.
  const channels: SocialChannel[] = ["facebook", "instagram", "wechat"];
  const social = diverse(available, 3).map((l, i) => ({ key: `social-${i}`, ...socialTemplate(channels[i], toDraftLot(l), firmName) }));

  // Blog: the suburb with the most available homes.
  const bySuburb = new Map<string, PartnerLot[]>();
  for (const l of available) {
    const k = `${l.suburb}|${l.state ?? ""}`;
    bySuburb.set(k, [...(bySuburb.get(k) ?? []), l]);
  }
  const best = [...bySuburb.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const monthYear = now.toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "Australia/Brisbane" });
  const blog = best
    ? blogTemplate(best[0].split("|")[0], best[0].split("|")[1] || null, best[1].map(toDraftLot), monthYear)
    : null;

  // Re-engagement: the five least recently active clients, then sample leads.
  const clients = input.clients
    .filter((c) => c.status !== "archived")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    .slice(0, 5);
  const messages: MessageDraft[] = [];
  const fallbackLots = diverse(available, 5);
  clients.forEach((c, i) => {
    const match = lotsForClient(c, available)[0] ?? available.find((l) => !c.state || l.state === c.state) ?? fallbackLots[i % Math.max(1, fallbackLots.length)];
    if (!match) return;
    const ageDays = (now.getTime() - Date.parse(c.updatedAt)) / 86_400_000;
    const warmth = ageDays > 30 ? "cold" : "warm";
    const channel = i % 2 === 0 ? "email" : "sms";
    messages.push({
      key: `msg-${i}`,
      clientName: c.firstName,
      sample: false,
      warmth,
      lastActive: relativeAge(c.updatedAt, now),
      channel,
      ...messageTemplate(warmth, toDraftLot(match), channel, sender),
      lot: toDraftLot(match),
    });
  });
  for (let i = messages.length; i < 5 && fallbackLots.length; i++) {
    const lot = toDraftLot(fallbackLots[i % fallbackLots.length]);
    const warmth = i % 2 === 0 ? "cold" : "warm";
    const channel = i % 2 === 0 ? "email" : "sms";
    messages.push({
      key: `msg-${i}`,
      clientName: SAMPLE_LEADS[i],
      sample: true,
      warmth,
      lastActive: null,
      channel,
      ...messageTemplate(warmth, lot, channel, sender),
      lot,
    });
  }

  // Match pack: the client with the most matching homes.
  let match: MatchPackDraft | null = null;
  const ranked = input.clients
    .filter((c) => c.status !== "archived" && c.budgetMax)
    .map((c) => ({ c, lots: lotsForClient(c, available) }))
    .filter((x) => x.lots.length)
    .sort((a, b) => b.lots.length - a.lots.length);
  const pick = ranked[0];
  const mid = available[Math.floor(available.length / 2)];
  const sampleBudget = mid ? Math.ceil((mid.price as number) / 50_000) * 50_000 : null;
  const sampleState = mid?.state ?? null;
  const sampleClient: WeekClient | null = sampleBudget
    ? { id: "sample", firstName: "Sample buyer", state: sampleState, budgetMax: sampleBudget, status: "active", updatedAt: now.toISOString() }
    : null;
  const target = pick ? { client: pick.c, lots: pick.lots, sample: false } : sampleClient ? { client: sampleClient, lots: lotsForClient(sampleClient, available), sample: true } : null;
  if (target && target.lots.length) {
    const budget = target.client.budgetMax as number;
    const picks = diverse(
      [...target.lots].sort((a, b) => (b.bedrooms ?? 0) - (a.bedrooms ?? 0) || (a.price as number) - (b.price as number)),
      3,
    ).map((l) => ({
      lot: toDraftLot(l),
      why: `${facts(toDraftLot(l))} · ${compactAud(budget - (l.price as number))} under budget`,
    }));
    match = {
      key: "match",
      clientName: target.client.firstName,
      sample: target.sample,
      brief: `Up to ${compactAud(budget)}${target.client.state ? ` in ${target.client.state}` : ""}`,
      intro: `${target.lots.length} available ${target.lots.length === 1 ? "home fits" : "homes fit"} this brief. Here are the three strongest, from different suburbs.`,
      picks,
    };
  }

  const draft: WeekDraft = {
    generatedAt: now.toISOString(),
    writer: "template",
    social,
    blog,
    messages,
    match,
    effort: { drafts: 0, minutesSaved: 0 },
  };
  draft.effort = weekEffort(draft);
  return draft;
}

export function weekEffort(d: Pick<WeekDraft, "social" | "blog" | "messages" | "match">): WeekDraft["effort"] {
  const drafts = d.social.length + (d.blog ? 1 : 0) + d.messages.length + (d.match ? 1 : 0);
  const minutesSaved =
    d.social.length * MINUTES_BY_HAND.social +
    (d.blog ? MINUTES_BY_HAND.blog : 0) +
    d.messages.length * MINUTES_BY_HAND.message +
    (d.match ? MINUTES_BY_HAND.match : 0);
  return { drafts, minutesSaved };
}

/** Swap the client's first name into a message (after any AI step, never before). */
export function personalise(body: string, firstName: string): string {
  return body.replace(/\{first_name\}/g, firstName);
}

// ── AI merge ────────────────────────────────────────────────────────────────

/** What Claude is asked to rewrite. No client names: messages carry {first_name}. */
export type AiWeekCopy = {
  social?: { key: string; headline?: string; body?: string; bodyZh?: string; hashtags?: string[] }[];
  blog?: { title?: string; intro?: string; sections?: { heading: string; body: string }[] };
  messages?: { key: string; subject?: string; body?: string }[];
  match?: { intro?: string };
};

/**
 * Apply Claude's rewrite draft by draft. Each rewritten draft must pass the
 * screen on its own; a failure keeps that draft's template and is counted.
 * Messages must keep the {first_name} placeholder and the SMS opt-out.
 */
export function mergeAiCopy(
  base: WeekDraft,
  ai: AiWeekCopy,
  opts: { supplierNames?: readonly string[] } = {},
): { draft: WeekDraft; accepted: number; rejected: { key: string; reasons: string[] }[] } {
  const rejected: { key: string; reasons: string[] }[] = [];
  let accepted = 0;
  const ok = (key: string, value: unknown): boolean => {
    const r = screenPartnerAiValue(value, opts);
    if (r.ok) {
      accepted++;
      return true;
    }
    rejected.push({ key, reasons: r.reasons });
    return false;
  };
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

  const social = base.social.map((s) => {
    const r = ai.social?.find((x) => x.key === s.key);
    if (!r) return s;
    const next: SocialDraft = {
      ...s,
      headline: str(r.headline, 120) ?? s.headline,
      body: str(r.body, 900) ?? s.body,
      bodyZh: s.channel === "wechat" ? str(r.bodyZh, 600) ?? s.bodyZh : undefined,
      hashtags: Array.isArray(r.hashtags) ? r.hashtags.filter((h) => typeof h === "string").slice(0, 8).map((h) => (h.startsWith("#") ? h : `#${h}`)) : s.hashtags,
    };
    return ok(s.key, [next.headline, next.body, next.bodyZh ?? "", next.hashtags]) ? next : s;
  });

  let blog = base.blog;
  if (blog && ai.blog) {
    const sections = Array.isArray(ai.blog.sections)
      ? ai.blog.sections
          .filter((x) => x && typeof x.heading === "string" && typeof x.body === "string")
          .slice(0, 5)
          .map((x) => ({ heading: x.heading.slice(0, 120), body: x.body.slice(0, 1500) }))
      : [];
    const next: BlogDraft = {
      ...blog,
      title: str(ai.blog.title, 140) ?? blog.title,
      intro: str(ai.blog.intro, 1200) ?? blog.intro,
      sections: sections.length ? sections : blog.sections,
    };
    blog = ok("blog", [next.title, next.intro, next.sections]) ? next : blog;
  }

  const messages = base.messages.map((m) => {
    const r = ai.messages?.find((x) => x.key === m.key);
    if (!r) return m;
    const body = str(r.body, m.channel === "sms" ? 320 : 1500);
    if (!body || !body.includes("{first_name}") || (m.channel === "sms" && !/reply stop/i.test(body))) {
      rejected.push({ key: m.key, reasons: ["format:placeholder-or-opt-out"] });
      return m;
    }
    const next: MessageDraft = { ...m, body, subject: m.channel === "email" ? str(r.subject, 120) ?? m.subject : undefined };
    return ok(m.key, [next.subject ?? "", next.body]) ? next : m;
  });

  let match = base.match;
  if (match && ai.match?.intro) {
    const next = { ...match, intro: str(ai.match.intro, 400) ?? match.intro };
    match = ok("match", next.intro) ? next : match;
  }

  return {
    draft: { ...base, social, blog, messages, match, writer: accepted > 0 ? "ai" : base.writer },
    accepted,
    rejected,
  };
}
