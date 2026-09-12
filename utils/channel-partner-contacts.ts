/**
 * Keeping channel-partner contact details current — the pure half.
 *
 * The research CSV was built from web pages, and web pages go stale: people
 * leave, firms rebrand, info@ gets replaced by a form. A pitch sent to a dead
 * address costs nothing to notice and a lot to explain, so every partner
 * carries a "verified" date and the panel won't send on stale details without
 * an explicit override.
 *
 * The rule that makes a check trustworthy: **a detail is only "confirmed" when
 * that exact email or phone number appears on the firm's own website.** The AI
 * web lookup is allowed to SUGGEST (names, roles, a new address), but a
 * suggestion it can't show on the firm's own pages stays "unconfirmed" and is
 * never pre-ticked. A language model asked for a contact email will happily
 * produce a plausible one; the page either says it or it doesn't.
 *
 * Nothing here touches the network — see channel-partners-server.ts.
 */

export const CONTACT_STALE_DAYS = 90;

export type Freshness = { state: "never" | "stale" | "fresh"; days: number | null };

export function contactFreshness(verifiedAt: string | null | undefined, now: Date = new Date()): Freshness {
  if (!verifiedAt) return { state: "never", days: null };
  const t = new Date(verifiedAt).getTime();
  if (Number.isNaN(t)) return { state: "never", days: null };
  const days = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
  return { state: days > CONTACT_STALE_DAYS ? "stale" : "fresh", days };
}

/** Cloudflare "email protection": hex string, first byte is the XOR key. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out : null;
}

const JUNK_EMAIL =
  /(\.(png|jpe?g|gif|webp|svg|css|js)$)|(@(sentry|wixpress|example|domain|email)\.)|(^(name|your|email|you)@)|(@2x)/i;

/** Every email address a page publishes: mailto links, plain text, and Cloudflare-protected ones. */
export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  const add = (e: string | null) => {
    if (!e) return;
    // Real pages produce "mailto:#steve@…" and "(info@…)": trim anything that can't start or end an address.
    const clean = decodeURIComponent(e).trim().replace(/^[^a-z0-9]+/i, "").replace(/[.,;:)]+$/, "").toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(clean) && !JUNK_EMAIL.test(clean)) found.add(clean);
  };
  for (const m of html.matchAll(/data-cfemail="([0-9a-f]+)"/gi)) add(decodeCfEmail(m[1]));
  for (const m of html.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) add(decodeCfEmail(m[1]));
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    try {
      add(m[1]);
    } catch {
      /* malformed %-escape — skip */
    }
  }
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) add(m[0]);
  return [...found];
}

/**
 * Australian numbers reduced to a comparable form: digits only, +61 → 0.
 * "+61 413 108 125", "0413 108 125" and "(04) 1310 8125" all → "0413108125".
 */
export function phoneKey(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+61")) d = "0" + d.slice(3);
  else if (d.startsWith("61") && d.length === 11) d = "0" + d.slice(2);
  return d.replace(/\D/g, "");
}

/** Every AU phone number on a page — tel: links plus the usual written shapes. */
export function extractPhones(html: string): string[] {
  const found = new Map<string, string>();
  const add = (raw: string) => {
    const k = phoneKey(raw);
    // 10-digit landline/mobile/1300/1800, or a 6-digit 13 xx xx.
    const ok = /^0[2-478]\d{8}$/.test(k) || /^1[38]00\d{6}$/.test(k) || /^13\d{4}$/.test(k);
    if (ok && !found.has(k)) found.set(k, raw.trim());
  };
  // tel: links first — they're deliberate, so they lead the list bestSite* picks from.
  for (const m of html.matchAll(/tel:([+\d\s()-]{6,20})/gi)) add(m[1]);
  const text = html.replace(/<[^>]+>/g, " ");
  // Only the groupings people actually write. A loose "ten digits with any
  // separators" pattern matched an ID ("034639019-9") on a real site.
  const sep = "[\\s-]?";
  const shapes = [
    new RegExp(`(?<![\\d-])04\\d{2}${sep}\\d{3}${sep}\\d{3}(?![\\d-])`, "g"), // 0412 345 678
    new RegExp(`(?<![\\d-])(?:\\(0[2378]\\)|0[2378])${sep}\\d{4}${sep}\\d{4}(?![\\d-])`, "g"), // (07) 5438 9775
    new RegExp(`\\+61${sep}(?:\\(0\\))?${sep}(?:4\\d{2}${sep}\\d{3}${sep}\\d{3}|[2378]${sep}\\d{4}${sep}\\d{4})(?![\\d-])`, "g"), // +61 …
    new RegExp(`(?<![\\d-])1[38]00${sep}(?:\\d{3}${sep}\\d{3}|\\d{2}${sep}\\d{2}${sep}\\d{2})(?![\\d-])`, "g"), // 1300 123 456 / 1300 12 34 56
    new RegExp(`(?<![\\d-])13${sep}(?!00)\\d{2}${sep}\\d{2}(?![\\d-])`, "g"), // 13 22 11
  ];
  for (const re of shapes) for (const m of text.matchAll(re)) add(m[0]);
  return [...found.values()];
}

/** A phone key back in the shape Australians write it: "07 5438 9775", "0412 345 678", "1300 123 456", "13 22 11". */
export function formatAuPhone(phone: string | null | undefined): string {
  const k = phoneKey(phone);
  if (/^04\d{8}$/.test(k)) return `${k.slice(0, 4)} ${k.slice(4, 7)} ${k.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(k)) return `${k.slice(0, 2)} ${k.slice(2, 6)} ${k.slice(6)}`;
  if (/^1[38]00\d{6}$/.test(k)) return `${k.slice(0, 4)} ${k.slice(4, 7)} ${k.slice(7)}`;
  if (/^13\d{4}$/.test(k)) return `${k.slice(0, 2)} ${k.slice(2, 4)} ${k.slice(4)}`;
  return (phone ?? "").trim();
}

/** Visible text, lower-cased and whitespace-collapsed — for "does this page mention X". */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * The registrable domain: www.goldpropertypartners.com.au → goldpropertypartners.com.au.
 * Two-part public suffixes (com.au, net.au, org.au, co.nz…) keep three labels.
 */
export function registrableDomain(hostOrUrl: string | null | undefined): string | null {
  if (!hostOrUrl) return null;
  let host = hostOrUrl.trim().toLowerCase();
  if (host.includes("@")) host = host.split("@").pop() ?? "";
  try {
    if (/^https?:\/\//.test(host)) host = new URL(host).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\/.*$/, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  const twoPart = /^(com|net|org|edu|gov|asn|id|co)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts.slice(twoPart ? -3 : -2).join(".");
}

export type FieldStatus = "same" | "confirmed" | "unconfirmed" | "gone";

export type FieldProposal = {
  field: "email" | "phone" | "contact_name" | "contact_role" | "website";
  current: string | null;
  proposed: string | null;
  status: FieldStatus;
  /** Why we believe it — shown next to the diff. */
  evidence: string;
  /** Pre-ticked in the review UI. Only ever true for a change we can show on the firm's own site. */
  recommended: boolean;
};

export type SiteScan = {
  /** Did any page on the firm's own site answer? A dead site is itself a finding. */
  reachable: boolean;
  pages: { url: string; status: number | null }[];
  emails: string[];
  phones: string[];
  /** Lower-cased visible text of every fetched page, joined. */
  text: string;
};

export type AiLookup = {
  still_trading: boolean | null;
  contact_name: string | null;
  contact_role: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  sources: string[];
  notes: string | null;
};

export type ContactCheck = {
  checked_at: string;
  reachable: boolean;
  pages: { url: string; status: number | null }[];
  emails_found: string[];
  phones_found: string[];
  ai_used: boolean;
  ai_error: string | null;
  still_trading: boolean | null;
  notes: string[];
  proposals: FieldProposal[];
  /** True when there is something to look at: a change, a vanished detail, or a dead site. */
  needs_review: boolean;
};

/**
 * Pick the address a first-touch email should go to from what the site
 * publishes: one naming the contact beats a role inbox, and a role inbox beats
 * noreply/accounts. Only addresses on the firm's own domain are considered.
 */
export function bestSiteEmail(emails: string[], website: string | null, contactName: string | null): string | null {
  const dom = registrableDomain(website);
  const own = emails.filter((e) => !dom || registrableDomain(e) === dom);
  if (own.length === 0) return null;
  const first = (contactName ?? "").split(/[\s/]+/)[0]?.toLowerCase();
  const byName = first && first.length > 1 ? own.find((e) => e.split("@")[0].includes(first)) : undefined;
  if (byName) return byName;
  const rank = (e: string) => {
    const local = e.split("@")[0];
    if (/^(no-?reply|accounts?|invoices?|billing|careers|jobs|privacy|webmaster)/.test(local)) return 9;
    if (/^(partners?|partnerships?|channel|wholesale|bdm)/.test(local)) return 0;
    if (/^(hello|info|contact|enquir|admin|sales|office|build)/.test(local)) return 1;
    return 2;
  };
  return [...own].sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * Turn a site scan (+ optional AI lookup) into per-field proposals.
 *
 * Email / phone:
 *   - current value is published on the site         → "same" (and now evidenced)
 *   - current value not on the site, site has another → propose the site's, "confirmed"
 *   - current value not on the site, nothing better   → "gone" — flag, change nothing
 *   - AI suggests a value the site shows              → "confirmed"
 *   - AI suggests a value the site doesn't show       → "unconfirmed", never pre-ticked
 * Name / role: AI-only. "confirmed" if the name appears in the site's text.
 */
export function buildContactProposals(
  current: { email: string | null; phone: string | null; contact_name: string | null; contact_role: string | null; website: string | null },
  scan: SiteScan,
  ai: AiLookup | null,
): FieldProposal[] {
  const out: FieldProposal[] = [];
  const siteEmails = new Set(scan.emails.map((e) => e.toLowerCase()));
  const sitePhones = new Set(scan.phones.map(phoneKey));

  // ── email
  const curEmail = current.email?.toLowerCase() ?? null;
  if (curEmail && siteEmails.has(curEmail)) {
    out.push({ field: "email", current: current.email, proposed: current.email, status: "same", evidence: "Published on their website", recommended: false });
  } else {
    const aiEmail = ai?.email?.toLowerCase() ?? null;
    const site = bestSiteEmail(scan.emails, current.website, current.contact_name);
    if (aiEmail && aiEmail !== curEmail && siteEmails.has(aiEmail)) {
      out.push({ field: "email", current: current.email, proposed: aiEmail, status: "confirmed", evidence: "Found by lookup and published on their website", recommended: true });
    } else if (site && site !== curEmail) {
      out.push({ field: "email", current: current.email, proposed: site, status: "confirmed", evidence: "Published on their website", recommended: true });
    } else if (aiEmail && aiEmail !== curEmail) {
      out.push({ field: "email", current: current.email, proposed: aiEmail, status: "unconfirmed", evidence: "Suggested by web lookup — not found on their website", recommended: false });
    } else if (curEmail && scan.reachable) {
      out.push({ field: "email", current: current.email, proposed: null, status: "gone", evidence: "No longer shown on their website — confirm by phone before emailing", recommended: false });
    }
  }

  // ── phone
  const curPhone = phoneKey(current.phone);
  if (curPhone && sitePhones.has(curPhone)) {
    out.push({ field: "phone", current: current.phone, proposed: current.phone, status: "same", evidence: "Published on their website", recommended: false });
  } else {
    const aiPhone = ai?.phone ? phoneKey(ai.phone) : "";
    const sitePhone = scan.phones[0] ?? null;
    if (aiPhone && aiPhone !== curPhone && sitePhones.has(aiPhone)) {
      out.push({ field: "phone", current: current.phone, proposed: formatAuPhone(ai!.phone), status: "confirmed", evidence: "Found by lookup and published on their website", recommended: true });
    } else if (sitePhone && phoneKey(sitePhone) !== curPhone) {
      out.push({ field: "phone", current: current.phone, proposed: formatAuPhone(sitePhone), status: "confirmed", evidence: "Published on their website", recommended: !curPhone || scan.phones.length === 1 });
    } else if (aiPhone && aiPhone !== curPhone) {
      out.push({ field: "phone", current: current.phone, proposed: formatAuPhone(ai!.phone), status: "unconfirmed", evidence: "Suggested by web lookup — not found on their website", recommended: false });
    } else if (curPhone && scan.reachable) {
      out.push({ field: "phone", current: current.phone, proposed: null, status: "gone", evidence: "No longer shown on their website", recommended: false });
    }
  }

  // ── name + role (AI only; the site text can corroborate)
  const name = ai?.contact_name?.trim() || null;
  if (name && name.toLowerCase() !== (current.contact_name ?? "").trim().toLowerCase()) {
    const onSite = scan.text.includes(name.toLowerCase());
    out.push({
      field: "contact_name",
      current: current.contact_name,
      proposed: name,
      status: onSite ? "confirmed" : "unconfirmed",
      evidence: onSite ? "Named on their website" : `Suggested by web lookup${ai?.sources.length ? ` (${ai.sources[0]})` : ""}`,
      // A name we can see on their own site fills a blank; it never silently replaces someone.
      recommended: onSite && !current.contact_name,
    });
  }
  const role = ai?.contact_role?.trim() || null;
  if (role && name && role.toLowerCase() !== (current.contact_role ?? "").trim().toLowerCase()) {
    const onSite = scan.text.includes(role.toLowerCase());
    out.push({
      field: "contact_role",
      current: current.contact_role,
      proposed: role,
      status: onSite ? "confirmed" : "unconfirmed",
      evidence: onSite ? "Shown on their website" : "Suggested by web lookup",
      recommended: onSite && !current.contact_role,
    });
  }

  // ── website moved (only when the AI says so AND the new site answered)
  if (ai?.website && registrableDomain(ai.website) && registrableDomain(ai.website) !== registrableDomain(current.website)) {
    out.push({ field: "website", current: current.website, proposed: ai.website, status: "unconfirmed", evidence: "Lookup suggests the firm has moved or rebranded", recommended: false });
  }
  return out;
}

/**
 * Worth a human's attention: a silent site, a possible closure, a change we can
 * show on their site, a vanished detail, or an unconfirmed new email / phone /
 * website. An unconfirmed name or role suggestion is shown but doesn't flag the
 * row — the details we'd actually send to are what have to be right.
 */
export function needsReview(proposals: FieldProposal[], reachable: boolean, stillTrading: boolean | null): boolean {
  if (!reachable || stillTrading === false) return true;
  return proposals.some(
    (p) =>
      p.status === "confirmed" ||
      p.status === "gone" ||
      (p.status === "unconfirmed" && (p.field === "email" || p.field === "phone" || p.field === "website")),
  );
}

/** The AI's JSON answer, defensively parsed — anything malformed becomes null, never a guess. */
export function parseAiLookup(text: string): AiLookup | null {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() && !/^(null|unknown|n\/a)$/i.test(v.trim()) ? v.trim() : null);
    const email = str(o.email);
    return {
      still_trading: typeof o.still_trading === "boolean" ? o.still_trading : null,
      contact_name: str(o.contact_name),
      contact_role: str(o.contact_role),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
      phone: str(o.phone),
      website: str(o.website),
      sources: Array.isArray(o.sources) ? o.sources.filter((u): u is string => typeof u === "string").slice(0, 6) : [],
      notes: str(o.notes),
    };
  } catch {
    return null;
  }
}
