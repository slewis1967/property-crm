/**
 * Channel Partners — recruiting firms that sell new-build stock (property
 * marketers, building brokers, investor clubs, SMSF/SDA/multi-tenancy
 * specialists) to take NextKey's sourced stock, and — where it fits — to refer
 * home buyers to Springboard.
 *
 * Pure on purpose: the client panel, the API routes and the tests all read the
 * same stream rules and the same pitch builder, so the email a partner receives
 * and the brochure they are shown can never describe different offers.
 *
 * ── The compliance rules this file encodes (each one is a real constraint) ──
 * - NextKey is a sourcing/research/supply service. The partner owns the client
 *   relationship and is the licensed party; we never give financial, credit,
 *   tax, superannuation or NDIS advice, and never state yields, growth, rent
 *   or occupancy.
 * - SMSF: the residential LRBA ban has been in force since 10 Aug 2026, so an
 *   SMSF pitch must never imply borrowing — single-contract stock for a cash
 *   purchase, full stop.
 * - SDA: category only. No yield, rent or occupancy figures, ever.
 * - Springboard is a Finance Program under Your Loan Assist's licence. Every
 *   new piece of material that promotes it needs its own clause 7 approval
 *   (clause 7.5 — never standing), so the Springboard paragraph is only put
 *   into a partner's email once `springboardRef` is set. It never mentions
 *   super or SMSF, uses the one approved sentence about where the deposit
 *   comes from, and says "completed homes only" because the program never
 *   funds construction.
 * - Springboard and SMSF never appear in the same email: a reader putting
 *   "deposit help" next to "SMSF" draws exactly the conclusion we may not.
 */

export type StreamKey = "core" | "smsf" | "sda" | "multi" | "springboard";

export const STREAM_ORDER: readonly StreamKey[] = ["core", "smsf", "sda", "multi", "springboard"];

export const STREAMS: Record<
  StreamKey,
  { label: string; short: string; colour: string; blurb: string; image: string }
> = {
  core: {
    label: "Core investor",
    short: "Core",
    colour: "#1b1f44",
    blurb:
      "House and land, townhouses, apartments and dual living from builders and developers, in one researched feed.",
    image: "/channel-partners/core-investor.jpg",
  },
  smsf: {
    label: "SMSF single-contract",
    short: "SMSF",
    colour: "#2f6f5e",
    blurb:
      "Single-contract stock, flagged. Since 10 August 2026 an SMSF can't enter a new LRBA to buy residential property, so new residential purchases are cash. Whether a property suits a fund is for the trustee and their advisers.",
    image: "/channel-partners/smsf-townhouses.jpg",
  },
  sda: {
    label: "Specialist Disability Accommodation",
    short: "SDA",
    colour: "#6b4e9b",
    blurb:
      "SDA-category stock from builders and developers, with the builder-stated design category and certification stage. No rent, yield or occupancy claims; no NDIS or financial advice.",
    image: "/channel-partners/sda-home.jpg",
  },
  multi: {
    label: "Multi-tenancy",
    short: "Multi-tenancy",
    colour: "#b0612a",
    blurb:
      "Co-living, rooming, dual-key and duplex stock, with the product and planning detail to check before you present it.",
    image: "/channel-partners/multi-tenancy.jpg",
  },
  springboard: {
    label: "Springboard home buyers",
    short: "Springboard",
    colour: "#020e40",
    blurb:
      "For clients looking at completed homes who haven't saved a full deposit.",
    image: "/channel-partners/springboard-keys.jpg",
  },
};

export const PARTNER_STATUSES = [
  "Not contacted",
  "Researching",
  "Contacted",
  "In conversation",
  "Agreement sent",
  "Signed",
  "Not a fit",
  "Do not contact",
] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

/** Statuses where sending a pitch would be wrong — either done, or refused. */
export const NO_PITCH_STATUSES: readonly PartnerStatus[] = ["Signed", "Not a fit", "Do not contact"];

export const PRIORITIES = ["A", "B", "C"] as const;
export type Priority = (typeof PRIORITIES)[number];

export type ChannelPartner = {
  id: string;
  company: string;
  channel_type: string | null;
  nextkey_stream_fit: string | null;
  stock_focus: string | null;
  supply_model: string | null;
  suggested_priority: string | null;
  priority_reason: string | null;
  contact_name: string | null;
  contact_role: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  source_url: string | null;
  verification_notes: string | null;
  licence_verified: string | null;
  status: string;
  next_action: string | null;
  last_contacted: string | null;
  notes: string | null;
  pitch_sent_at?: string | null;
  contact_verified_at?: string | null;
  contact_verified_by?: string | null;
  contact_verified_method?: string | null;
  contact_check?: import("./channel-partner-contacts").ContactCheck | null;
  contact_checked_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

/** Editable columns — the single allow-list shared by POST and PATCH. */
export const EDITABLE_FIELDS = [
  "company",
  "channel_type",
  "nextkey_stream_fit",
  "stock_focus",
  "supply_model",
  "suggested_priority",
  "priority_reason",
  "contact_name",
  "contact_role",
  "email",
  "phone",
  "location",
  "website",
  "source_url",
  "verification_notes",
  "licence_verified",
  "status",
  "next_action",
  "last_contacted",
  "notes",
] as const;

/**
 * Request body → row, through the allow-list. Text is trimmed and empty
 * becomes null; status and priority must be one of the known values (an
 * unknown status would fall out of every filter chip and be invisible);
 * last_contacted must be a 'YYYY-MM-DD' date.
 */
export function coercePartnerBody(b: Record<string, unknown>, forInsert: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  for (const k of EDITABLE_FIELDS) {
    if (!forInsert && !has(k)) continue;
    const raw = b[k];
    const v = typeof raw === "string" && raw.trim() ? raw.trim() : null;
    if (k === "status") {
      row.status = v && (PARTNER_STATUSES as readonly string[]).includes(v) ? v : "Not contacted";
    } else if (k === "suggested_priority") {
      row.suggested_priority = v && (PRIORITIES as readonly string[]).includes(v.toUpperCase()) ? v.toUpperCase() : null;
    } else if (k === "last_contacted") {
      row.last_contacted = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    } else if (k === "email") {
      row.email = v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
    } else {
      row[k] = v;
    }
  }
  return row;
}

/**
 * The CSV's `nextkey_stream_fit` is free text ("Springboard / Core investor",
 * "Core investor / SMSF / multi-tenancy"). Map it to stream keys in a fixed
 * order so the same partner always gets the same pitch.
 */
export function parseStreams(fit: string | null | undefined): StreamKey[] {
  const s = (fit ?? "").toLowerCase();
  const found = new Set<StreamKey>();
  if (/core|investor/.test(s)) found.add("core");
  if (/smsf/.test(s)) found.add("smsf");
  if (/\bsda\b|ndis|disability/.test(s)) found.add("sda");
  if (/multi|co-?living|rooming|dual/.test(s)) found.add("multi");
  if (/springboard/.test(s)) found.add("springboard");
  return STREAM_ORDER.filter((k) => found.has(k));
}

/** True when there is no way to reach them yet, or the research says so. */
export function needsEnrichment(p: Pick<ChannelPartner, "email" | "phone" | "verification_notes">): boolean {
  if (!p.email && !p.phone) return true;
  return /enrich/i.test(p.verification_notes ?? "");
}

/**
 * A greeting name. "Lisa Thomas / Tayla Thomas" → "Lisa and Tayla";
 * "Deb / Minh" → "Deb and Minh"; nothing → null (caller says "Hi there").
 */
export function greetingName(contactName: string | null | undefined): string | null {
  const parts = (contactName ?? "")
    .split("/")
    .map((s) => s.trim().split(/\s+/)[0])
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export type StockStats = {
  available: number;
  builders: number;
  suburbs: number;
  addedLast30: number;
  asAt: string;
};

/**
 * Round DOWN, coarsely, with a "+": 1,628 → "1,500+", 291 → "250+", 162 →
 * "150+", 47 → "40+". Rounding down is the point — a figure in marketing copy
 * must still be true after a few listings sell or a duplicate is cleaned out
 * (the feed has both), and "1,628" invites someone to check it. `step` forces
 * a coarser floor for a count known to carry junk (the builder list includes
 * people's names and "(forwarder unknown)").
 */
export function niceCount(n: number, step?: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 20) return String(Math.floor(n));
  const s = step ?? (n >= 1000 ? 500 : n >= 100 ? 50 : 10);
  const floored = Math.floor(n / s) * s;
  if (floored <= 0) return String(Math.floor(n));
  return `${floored.toLocaleString("en-AU")}+`;
}

/** "11 September 2026" in Brisbane time, for the as-at date the figures carry. */
export function asAtLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" });
}

/** The rounded figures, as rendered everywhere (email, call script, brochure). */
export function stockFigures(stats: StockStats) {
  return {
    listings: niceCount(stats.available),
    builders: niceCount(stats.builders, stats.builders >= 100 ? 100 : 10),
    suburbs: niceCount(stats.suburbs),
    added: niceCount(stats.addedLast30),
    asAt: asAtLabel(stats.asAt),
  };
}

/** One sentence of live stock figures with their as-at date, or null when the numbers aren't usable. */
export function stockSentence(stats: StockStats | null | undefined): string | null {
  if (!stats || stats.available < 100 || stats.builders < 10) return null;
  const f = stockFigures(stats);
  const parts = [`${f.listings} current listings`, `from ${f.builders} builders and developers`];
  if (stats.suburbs >= 20) parts.push(`across ${f.suburbs} suburbs`);
  const tail = stats.addedLast30 >= 20 ? `, with ${f.added} added in the last 30 days` : "";
  return `As at ${f.asAt}, that's ${parts.join(" ")}${tail}.`;
}

/** What the firm does, in the words the pitch opens with. Keyed off the CSV's channel_type. */
export function whatTheyDo(channelType: string | null | undefined): string {
  const t = (channelType ?? "").toLowerCase();
  if (/investor club|education/.test(t)) return "gives its members access to investment property";
  if (/building broker/.test(t)) return "matches buyers with builders";
  if (/smsf/.test(t)) return "works with buyers purchasing through their SMSF";
  if (/sda|ndis/.test(t)) return "works in Specialist Disability Accommodation";
  if (/multi-tenancy|co-?living/.test(t)) return "specialises in multi-tenancy property";
  if (/dual occupancy/.test(t)) return "works in dual-occupancy property";
  if (/boutique agency|agency/.test(t)) return "sells house-and-land packages";
  if (/advisory/.test(t)) return "helps clients buy new investment property";
  if (/marketer/.test(t)) return "puts new-build stock in front of buyers";
  return "works with property buyers";
}

const STREAM_BULLET: Record<Exclude<StreamKey, "springboard">, string> = {
  core: "House and land, townhouses, apartments and dual living from builders and developers, in one feed.",
  smsf:
    "Single-contract stock, flagged for you. Since 10 August 2026 an SMSF can't enter a new LRBA to buy residential property, so new residential purchases are cash. We flag single-contract stock; whether it suits a fund is for the trustee and their advisers.",
  sda:
    "SDA-category stock from builders and developers, with the builder-stated design category and certification stage. We don't state rent, yield or occupancy, and we don't give NDIS or financial advice.",
  multi:
    "Co-living, rooming, dual-key and duplex stock, with the product and planning detail to check before you present it.",
};

const SUBJECT: Record<Exclude<StreamKey, "springboard">, (company: string) => string> = {
  core: (c) => `New-build stock for ${c}, sourced and researched`,
  smsf: () => `Single-contract stock for your SMSF buyers`,
  sda: (c) => `SDA stock, sourced and researched for ${c}`,
  multi: (c) => `Co-living and dual-key stock for ${c}`,
};

/**
 * The Springboard paragraph — held back until a clause 7 reference is recorded
 * (and that reference must rest on YLA's WRITTEN approval of this exact text).
 * Every phrase is load-bearing: it is YLA's program, not ours; "may be able
 * to help" is conditional; the deposit sentence is the ONLY approved public
 * wording about where the deposit comes from; eligibility "depends on a number
 * of factors" because the real criteria can't be stated (super may not be
 * mentioned) and must not read as complete; completed homes only, because the
 * program never funds construction; referrals go to Springboard Homes, since
 * the same email promises "we never contact your buyers". No referral-fee
 * mention: whether paid referrals fit the NCCP referrer exemption is with
 * counsel.
 */
export const SPRINGBOARD_PARAGRAPH =
  "For clients looking at completed homes who haven't saved a full deposit: the Community Funding Program, offered through Your Loan Assist, may be able to help eligible buyers purchase a completed home, with the deposit raised by Australians helping Australians buy property. It covers completed homes only, not house-and-land construction contracts. Eligibility depends on a number of factors and is assessed by Your Loan Assist (CRE8 Finance Pty Ltd, Australian Credit Licence 477483). Accredited Springboard Homes introducers can refer those clients to Springboard Homes.";

export const PITCH_FOOTER =
  "General information only. NextKey sources and researches property; it does not provide financial, credit, tax, superannuation or NDIS advice. If you'd rather not hear from us, reply \"unsubscribe\" and we won't contact you again.";

export type PitchEmail = {
  subject: string;
  text: string;
  html: string;
  streams: StreamKey[];
  includesSpringboard: boolean;
  /** Things the operator should know before sending. Not blockers on their own. */
  notes: string[];
};

export type PitchOptions = {
  /** The clause 7 approval reference for the Springboard partner pitch. Null = not approved. */
  springboardRef?: string | null;
};

/**
 * Build the first-touch email for one partner.
 *
 * Text-first on purpose: a cold B2B email carrying a gallery of images lands in
 * Promotions or spam, and the CRM (and its /public images) sits behind
 * Cloudflare Access, so an embedded image would render as a broken box in the
 * partner's inbox anyway. The visual story lives in the brochure.
 */
export function buildPitchEmail(
  p: Pick<ChannelPartner, "company" | "channel_type" | "nextkey_stream_fit" | "contact_name">,
  stats: StockStats | null,
  opts: PitchOptions = {},
): PitchEmail {
  const notes: string[] = [];
  const all = parseStreams(p.nextkey_stream_fit);
  const nextkeyStreams = all.filter((s): s is Exclude<StreamKey, "springboard"> => s !== "springboard");
  const wantsSpringboard = all.includes("springboard");

  // Springboard never shares an email with SMSF — see the file header.
  let includesSpringboard = wantsSpringboard && !!opts.springboardRef;
  if (includesSpringboard && nextkeyStreams.includes("smsf")) {
    includesSpringboard = false;
    notes.push("Springboard left out: this partner is also SMSF-stream, and the two never share an email.");
  }
  if (wantsSpringboard && !opts.springboardRef) {
    notes.push("Springboard paragraph held back: the partner pitch has no clause 7 approval reference yet.");
  }

  // A Springboard-only partner still gets the NextKey core offer as the lead —
  // without an approval there would otherwise be nothing to say.
  const lead: Exclude<StreamKey, "springboard"> = nextkeyStreams[0] ?? "core";
  const bullets = nextkeyStreams.length ? nextkeyStreams : (["core"] as const);

  const company = p.company.trim();
  const hi = greetingName(p.contact_name);
  const stock = stockSentence(stats);
  if (!stock) notes.push("Live stock figures unavailable, so the email doesn't quote any.");

  const paragraphs: string[] = [
    `Hi ${hi ?? "there"},`,
    `I'm getting in touch because ${company} ${whatTheyDo(p.channel_type)}, and we'd like to help you do more of it.`,
    `NextKey sources new and project property from builders and developers across Australia, researches it, and supplies it to channel partners ready to present.${stock ? " " + stock : ""}`,
  ];

  const benefitLines = [
    "More stock without a sourcing team. We collect builders' stocklists, check the listings and do the research, so your time goes to buyers.",
    "Research under your brand. Suburb and property reports prepared with your own branding, so your clients keep dealing with you. Listing details come from builders; confirm price and availability before presenting.",
    ...bullets.map((s) => STREAM_BULLET[s]),
    "You stay in charge of the client. You present, advise and transact; we never contact your buyers.",
  ];

  const aiParagraph =
    "Behind it is our own AI platform. It extracts listings from builders' stocklists, and we check them before they reach your feed. Tell us your buyers' briefs and we'll send you matching stock.";

  const cta =
    "Would a 15-minute call next week be useful? Reply with a time that suits and I'll send a sample of current stock in your area beforehand.";

  const text = [
    ...paragraphs,
    `What that means for ${company}:\n${benefitLines.map((b) => `• ${b}`).join("\n")}`,
    aiParagraph,
    ...(includesSpringboard ? [SPRINGBOARD_PARAGRAPH] : []),
    cta,
    PITCH_FOOTER,
  ].join("\n\n");

  const html = pitchTextToHtml(text);

  return {
    subject: SUBJECT[lead](company),
    text,
    html,
    streams: all,
    includesSpringboard,
    notes,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render pitch text as email HTML. Driven from the TEXT so an operator's edits
 * in the panel are exactly what gets sent: blank lines split paragraphs, lines
 * starting "• " become a list (lead-in sentence bolded so it scans), a line
 * ending ":" right before a list is its heading, and the "General information
 * only" paragraph is set as small print.
 */
export function pitchTextToHtml(text: string): string {
  const para = (s: string) =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2937">${escapeHtml(s).replace(/\n/g, "<br>")}</p>`;
  const li = (s: string) => {
    const m = /^([^.]+\.)\s+(.+)$/.exec(s);
    const body = m
      ? `<strong style="color:#1b1f44">${escapeHtml(m[1])}</strong> ${escapeHtml(m[2])}`
      : escapeHtml(s);
    return `<li style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#1f2937">${body}</li>`;
  };
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const bulletAt = lines.findIndex((l) => l.trimStart().startsWith("•"));
    if (bulletAt >= 0) {
      const head = lines.slice(0, bulletAt).join(" ").trim();
      if (head) {
        out.push(`<p style="margin:18px 0 8px;font-size:15px;font-weight:bold;color:#1b1f44">${escapeHtml(head)}</p>`);
      }
      const items = lines.slice(bulletAt).map((l) => l.replace(/^\s*•\s*/, "").trim()).filter(Boolean);
      out.push(`<ul style="margin:0 0 16px;padding-left:20px">${items.map(li).join("")}</ul>`);
    } else if (/^General information only/i.test(block)) {
      out.push(`<p style="margin:20px 0 0;font-size:11px;line-height:1.5;color:#6b7280">${escapeHtml(block)}</p>`);
    } else {
      out.push(para(block));
    }
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px">${out.join("")}</div>`;
}

/**
 * Phone opener for the 19 of 24 targets with no published email. Same offer,
 * same limits as the email; written to be SAID, so short sentences. The
 * Springboard line obeys the same clause 7 gate and SMSF separation.
 */
export function buildCallScript(
  p: Pick<ChannelPartner, "company" | "channel_type" | "nextkey_stream_fit" | "contact_name">,
  stats: StockStats | null,
  opts: PitchOptions = {},
): string[] {
  const all = parseStreams(p.nextkey_stream_fit);
  const nk = all.filter((s): s is Exclude<StreamKey, "springboard"> => s !== "springboard");
  const hi = greetingName(p.contact_name);
  const who = hi ? `Could I speak with ${hi}?` : "Who looks after supplier or stock partnerships there?";
  const lines = [
    `Opener: "Hi, it's [your name] from NextKey Property Strategists. ${who}"`,
    `Why them: "I'm calling because ${p.company} ${whatTheyDo(p.channel_type)}. We source new and project stock from builders and developers and supply it to firms like yours, researched and ready to present."`,
  ];
  if (stats && stockSentence(stats)) {
    lines.push(`Proof: "${stockSentence(stats)}"`);
  }
  const streamLine: Record<Exclude<StreamKey, "springboard">, string> = {
    core: "house and land, townhouses, apartments and dual living",
    smsf: "single-contract stock, flagged, for SMSF buyers purchasing with cash",
    sda: "SDA-category stock, with the builder-stated design category and certification stage",
    multi: "co-living, rooming, dual-key and duplex stock",
  };
  const streamsSaid = (nk.length ? nk : (["core"] as const)).map((s) => streamLine[s]).join("; ");
  lines.push(`Their fit: "For you that's mainly ${streamsSaid}. Research comes under your branding, and we never contact your buyers."`);
  lines.push(
    `The platform: "It runs on our own AI platform. It extracts listings from builders' stocklists and we check them before they reach you. Give us your buyers' briefs and we'll send matching stock."`,
  );
  if (all.includes("springboard") && opts.springboardRef && !nk.includes("smsf")) {
    lines.push(
      `Springboard (only if they raise clients without a full deposit): "For completed homes, the Community Funding Program offered through Your Loan Assist may be able to help eligible buyers. Eligibility depends on a number of factors and Your Loan Assist assesses it. Accredited Springboard Homes introducers can refer those clients."`,
    );
  }
  lines.push(`Ask: "Could we book 15 minutes next week? I'll send a sample of current stock in your area first. What's the best email for that?"`);
  lines.push(`If they already have suppliers: "That's fine, most of our partners do. We add stock and research alongside what you have."`);
  lines.push(
    `Never say: rent, yield, growth or occupancy figures; anything about super, or that an SMSF can borrow; that a buyer will be approved; any referral fee amount.`,
  );
  return lines;
}

/** Headline figures for the panel header. */
export function summarisePartners(rows: ChannelPartner[]) {
  const byPriority: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byStream: Record<StreamKey, number> = { core: 0, smsf: 0, sda: 0, multi: 0, springboard: 0 };
  let reachable = 0;
  let enrich = 0;
  for (const r of rows) {
    const pr = r.suggested_priority || "—";
    byPriority[pr] = (byPriority[pr] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    for (const s of parseStreams(r.nextkey_stream_fit)) byStream[s] += 1;
    if (r.email) reachable += 1;
    if (needsEnrichment(r)) enrich += 1;
  }
  return { total: rows.length, byPriority, byStatus, byStream, reachable, enrich };
}

/** Table-level "migration not applied" only — see factFindsTableMissing for why it's narrow. */
export function channelPartnersTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    msg.includes('relation "public.channel_partners" does not exist') ||
    msg.includes("could not find the table 'public.channel_partners'")
  );
}
