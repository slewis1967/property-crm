/**
 * Channel Partners — the server-only half (service-key Supabase, outbound
 * fetches, OpenRouter). Pure rules live in channel-partners.ts and
 * channel-partner-contacts.ts.
 *
 * Live stock figures: the numbers go into marketing copy, so they are computed
 * from the feed rather than typed in — a hard-coded "1,500+" is true the day it
 * is written and quietly false after the next clean-up. Conservative by
 * construction: only rows whose status says available, and niceCount() rounds
 * down (coarsely) when it is rendered.
 */
import { supabase } from "./supabase";
import type { ChannelPartner, StockStats } from "./channel-partners";
import { isPubliclyRoutable } from "./lender-policy/source-check";
import { MODELS, orText } from "./openrouter";
import { log, errInfo } from "./logger";
import {
  buildContactProposals,
  contactFreshness,
  extractEmails,
  extractPhones,
  needsReview,
  pageText,
  parseAiLookup,
  registrableDomain,
  type AiLookup,
  type ContactCheck,
  type SiteScan,
} from "./channel-partner-contacts";

const PAGE = 1000; // PostgREST max-rows; see the Stock Map note in CLAUDE.md
const TTL_MS = 10 * 60 * 1000;

let cache: { at: number; stats: StockStats } | null = null;

export async function getStockStats(): Promise<StockStats | null> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.stats;
  try {
    const rows: { suburb: string | null; state: string | null; builder_name: string | null; created_at: string | null }[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("global_stock_pool")
        .select("suburb,state,builder_name,created_at")
        // "Available", "Completed Build - AVAILABLE", "AVAILABLE – Construction…"
        // all count; Hold / Sold / Under Contract / legacy / null do not.
        .ilike("status", "%available%")
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stats: StockStats = {
      available: rows.length,
      builders: new Set(rows.map((r) => (r.builder_name ?? "").trim().toLowerCase()).filter(Boolean)).size,
      suburbs: new Set(
        rows.filter((r) => r.suburb).map((r) => `${(r.suburb ?? "").trim().toUpperCase()}|${r.state ?? ""}`),
      ).size,
      addedLast30: rows.filter((r) => r.created_at && new Date(r.created_at).getTime() >= since).length,
      asAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), stats };
    return stats;
  } catch {
    // A pitch without figures is fine; a pitch that fails to load is not.
    return null;
  }
}

/**
 * The clause 7 approval reference for the Springboard section of the partner
 * pitch, or null. Env-set (Netlify → CHANNEL_PITCH_SPRINGBOARD_REF) rather than
 * a table row on purpose: recording an approval is a deliberate act by whoever
 * holds the Licensor's written sign-off, not a toggle any CRM user can flip.
 * While unset the Springboard paragraph is never put into an email, and the
 * brochure's Springboard page prints with a DRAFT stamp.
 */
export function springboardPitchRef(): string | null {
  const v = (process.env.CHANNEL_PITCH_SPRINGBOARD_REF ?? "").trim();
  return v || null;
}

// ── Contact check ───────────────────────────────────────────────────────────

const PAGE_TIMEOUT_MS = 6000;
const AI_TIMEOUT_MS = 17000;
const MAX_PAGE_BYTES = 1_500_000;
const UA = "Mozilla/5.0 (compatible; NextKeyCRM/1.0; +https://nextkey.com.au)";
// Where firms put contact details. The homepage footer usually has them too.
const CONTACT_PATHS = ["", "/contact", "/contact-us", "/about", "/about-us", "/our-team", "/team"];

/**
 * GET one page from the firm's site. Redirects are followed by hand so every
 * hop passes the SSRF guard — these URLs come from a CSV and a language model,
 * and `redirect: "follow"` would happily chase a 302 to 169.254.169.254.
 */
async function fetchPage(url: string, timeoutMs = PAGE_TIMEOUT_MS): Promise<{ url: string; status: number | null; html: string | null }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { url, status: null, html: null };
    }
    if (!isPubliclyRoutable(parsed)) return { url, status: null, html: null };
    try {
      const res = await fetch(parsed, {
        redirect: "manual",
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        current = new URL(location, parsed).toString();
        continue;
      }
      if (!res.ok) return { url, status: res.status, html: null };
      const type = res.headers.get("content-type") ?? "";
      if (!/html|text/.test(type)) return { url, status: res.status, html: null };
      const buf = await res.arrayBuffer();
      return { url, status: res.status, html: new TextDecoder().decode(buf.slice(0, MAX_PAGE_BYTES)) };
    } catch {
      return { url, status: null, html: null };
    }
  }
  return { url, status: null, html: null };
}

function candidateUrls(p: Pick<ChannelPartner, "website" | "source_url">): string[] {
  const out = new Set<string>();
  const base = (p.website ?? "").trim();
  if (base) {
    try {
      const origin = new URL(/^https?:\/\//.test(base) ? base : `https://${base}`).origin;
      for (const path of CONTACT_PATHS) out.add(origin + path);
    } catch {
      /* unparseable website — the source_url may still work */
    }
  }
  // The research source page, if it's on their own site (a Wikipedia or
  // LinkedIn source is useless as evidence of THEIR published details).
  if (p.source_url && registrableDomain(p.source_url) === registrableDomain(p.website)) out.add(p.source_url);
  // "https://x.com.au/" and "https://x.com.au" are the same page — don't fetch it twice.
  return [...new Set([...out].map((u) => u.replace(/\/+$/, "")))].slice(0, 8);
}

async function scanSite(urls: string[]): Promise<SiteScan> {
  const pages = await Promise.all(urls.map((u) => fetchPage(u)));
  const htmls = pages.map((p) => p.html).filter((h): h is string => !!h);
  return {
    reachable: htmls.length > 0,
    pages: pages.map((p) => ({ url: p.url, status: p.status })),
    emails: [...new Set(htmls.flatMap(extractEmails))],
    phones: [...new Map(htmls.flatMap(extractPhones).map((ph) => [ph.replace(/\D/g, ""), ph])).values()],
    text: htmls.map(pageText).join(" "),
  };
}

const AI_SYSTEM = `You verify the current public business contact details of an Australian property firm, for a
business-to-business partnership approach. Use web search. Prefer the firm's OWN website; LinkedIn and
ASIC/ABN records are acceptable for a person's name and role.

Rules:
- Only report a detail you actually found in a source, and list that source URL.
- Never guess or construct an email address from a name pattern. If you did not see it, use null.
- Report a business role inbox (info@, hello@, partners@) if no named person's address is published.
- still_trading: false only if a source says the firm has closed, been deregistered or rebranded away;
  null if unsure.
- website: only if the firm now uses a DIFFERENT domain from the one given.

Output STRICT JSON only, no commentary:
{"still_trading": true|false|null, "contact_name": string|null, "contact_role": string|null,
 "email": string|null, "phone": string|null, "website": string|null, "sources": [string], "notes": string|null}`;

async function aiLookup(p: ChannelPartner): Promise<{ ai: AiLookup | null; error: string | null }> {
  const user = [
    `Firm: ${p.company}`,
    p.website ? `Website on file: ${p.website}` : "Website on file: none",
    p.location ? `Location: ${p.location}` : "",
    p.channel_type ? `Type: ${p.channel_type}` : "",
    `Contact on file: ${p.contact_name ?? "none"}${p.contact_role ? ` (${p.contact_role})` : ""}`,
    `Email on file: ${p.email ?? "none"}; phone on file: ${p.phone ?? "none"}`,
    "",
    "Who is the right person to approach about a stock-supply / channel partnership, and what are the firm's current published email and phone?",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const text = await Promise.race([
      orText({ model: MODELS.fast, web: true, thinking: false, maxTokens: 700, system: AI_SYSTEM, user }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("lookup timed out")), AI_TIMEOUT_MS)),
    ]);
    const ai = parseAiLookup(text);
    return ai ? { ai, error: null } : { ai: null, error: "lookup returned no usable answer" };
  } catch (e) {
    // The site scan still stands on its own; the AI is a bonus.
    return { ai: null, error: e instanceof Error ? e.message.slice(0, 160) : "lookup failed" };
  }
}

/**
 * Check one partner's contact details against their own website (+ an AI web
 * lookup for names/roles). Returns proposals; changes NOTHING — applying a
 * proposal is an operator's click in the panel.
 *
 * Budget: page fetches (≤6s, parallel) and the AI call (≤17s) run concurrently,
 * then at most two of the AI's own-site sources are fetched (≤4s) so a detail
 * it found on a page we didn't guess can still be confirmed. ~21s worst case,
 * inside Netlify's ~26s ceiling.
 */
export async function checkPartnerContact(p: ChannelPartner): Promise<ContactCheck> {
  const notes: string[] = [];
  const urls = candidateUrls(p);
  if (urls.length === 0) notes.push("No website on file, so nothing could be confirmed against their own site.");

  const emptyScan: SiteScan = { reachable: false, pages: [], emails: [], phones: [], text: "" };
  const [scan, { ai, error: aiError }] = await Promise.all([urls.length ? scanSite(urls) : Promise.resolve(emptyScan), aiLookup(p)]);

  if (ai?.sources.length) {
    const fetched = new Set(scan.pages.map((pg) => pg.url));
    const extra = ai.sources
      .filter((u) => !fetched.has(u) && registrableDomain(u) && registrableDomain(u) === registrableDomain(p.website))
      .slice(0, 2);
    const more = await Promise.all(extra.map((u) => fetchPage(u, 4000)));
    for (const m of more) {
      scan.pages.push({ url: m.url, status: m.status });
      if (m.html) {
        scan.reachable = true;
        scan.emails = [...new Set([...scan.emails, ...extractEmails(m.html)])];
        scan.phones = [...new Set([...scan.phones, ...extractPhones(m.html)])];
        scan.text += " " + pageText(m.html);
      }
    }
  }

  if (urls.length && !scan.reachable) notes.push("Their website didn't answer — it may be down, blocking automated checks, or gone.");
  if (ai?.still_trading === false) notes.push(`Web lookup suggests the firm may no longer be trading${ai.notes ? `: ${ai.notes}` : "."}`);
  else if (ai?.notes) notes.push(ai.notes);

  const proposals = buildContactProposals(
    { email: p.email, phone: p.phone, contact_name: p.contact_name, contact_role: p.contact_role, website: p.website },
    scan,
    ai,
  );
  return {
    checked_at: new Date().toISOString(),
    reachable: scan.reachable,
    pages: scan.pages,
    emails_found: scan.emails.slice(0, 20),
    phones_found: scan.phones.slice(0, 20),
    ai_used: !!ai,
    ai_error: aiError,
    still_trading: ai?.still_trading ?? null,
    notes,
    proposals,
    needs_review: needsReview(proposals, scan.reachable, ai?.still_trading ?? null),
  };
}

/**
 * True when every detail we hold was found, unchanged, on the firm's own site —
 * the one case a check may count as verification without a human. Anything
 * else (a change, a vanished detail, a silent site) waits for review.
 */
export function checkConfirmsCurrent(p: Pick<ChannelPartner, "email" | "phone">, check: ContactCheck): boolean {
  if (!check.reachable || check.still_trading === false) return false;
  if (!p.email && !p.phone) return false;
  const status = (f: "email" | "phone") => check.proposals.find((x) => x.field === f)?.status;
  if (p.email && status("email") !== "same") return false;
  if (p.phone && status("phone") !== "same") return false;
  return !check.proposals.some((x) => x.status === "confirmed" || x.status === "gone");
}

type SweepRow = ChannelPartner & { contact_verified_at?: string | null; contact_checked_at?: string | null };

/**
 * Scheduled re-check (cron job "partners"): take the stalest partners that have
 * a website, check them, and store the result for review. Applies no changes
 * EXCEPT stamping verification when the check shows every detail we hold is
 * still published unchanged on their site.
 *
 * Small `limit` on purpose: each check is a ~20s outbound job, the endpoint
 * shares its timeout with the other sweeps, and a list of ~24 firms re-checked
 * a couple at a time is still fully refreshed within a day or two of going stale.
 */
export async function runPartnerContactSweep(opts: { limit?: number; now?: Date } = {}) {
  const limit = Math.max(1, Math.min(opts.limit ?? 2, 5));
  const now = opts.now ?? new Date();
  const { data, error } = await supabase
    .from("channel_partners")
    .select("*")
    .not("website", "is", null)
    .order("contact_checked_at", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error) throw error;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const due = ((data ?? []) as SweepRow[])
    .filter((p) => p.status !== "Do not contact" && p.status !== "Not a fit")
    .filter((p) => contactFreshness(p.contact_verified_at, now).state !== "fresh")
    // A check nobody has looked at yet is not re-run more than weekly.
    .filter((p) => !p.contact_checked_at || new Date(p.contact_checked_at).getTime() < weekAgo)
    .slice(0, limit);

  const results: { company: string; needs_review: boolean; auto_verified: boolean; error?: string }[] = [];
  for (const p of due) {
    try {
      const check = await checkPartnerContact(p);
      const auto = checkConfirmsCurrent(p, check);
      const update: Record<string, unknown> = { contact_check: check, contact_checked_at: check.checked_at };
      if (auto) {
        update.contact_verified_at = check.checked_at;
        update.contact_verified_by = "contact-check (automatic)";
        update.contact_verified_method = "website";
      }
      const { error: upErr } = await supabase.from("channel_partners").update(update).eq("id", p.id);
      if (upErr) throw upErr;
      results.push({ company: p.company, needs_review: check.needs_review, auto_verified: auto });
    } catch (e) {
      log.error("channel_partners.sweep_check_failed", { id: p.id, ...errInfo(e) });
      results.push({ company: p.company, needs_review: false, auto_verified: false, error: e instanceof Error ? e.message : "failed" });
    }
  }
  return { ok: true, checked: results.length, results };
}
