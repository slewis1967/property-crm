/**
 * Prospect builders — stock suppliers we are signing a marketing agreement
 * with. Pure helpers shared by the API routes and the /aggregator/builders UI.
 * Schema: migrations/20260914b_prospect_builders.sql.
 */

export const PROSPECT_STATUSES = [
  "prospect",
  "agreement_requested",
  "agreement_signed",
  "onboarded",
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  prospect: "Prospect",
  agreement_requested: "Agreement requested",
  agreement_signed: "Agreement signed",
  onboarded: "Onboarded",
};

export type ProspectContact = {
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  phone_alt: string | null;
  notes: string | null;
};

export type ProspectBuilder = {
  id: string;
  company: string;
  category: string | null;
  location: string | null;
  website: string | null;
  signup_method: string | null;
  stock_types: string | null;
  commission_notes: string | null;
  verification_notes: string | null;
  source_url: string | null;
  next_action: string | null;
  notes: string | null;
  contacts: ProspectContact[];
  status: ProspectStatus;
  agreement_requested_at: string | null;
  agreement_requested_by: string | null;
  agreement_signed_at: string | null;
  agreement_signed_by: string | null;
  onboarded_at: string | null;
  onboarded_by: string | null;
  builder_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Forward steps that only change the prospect row. Onboarding is separate
 *  because it also writes to `builders`. */
export const STEP_ACTIONS = {
  request_agreement: { from: "agreement_requested", stamp: "agreement_requested" },
  mark_signed: { from: "agreement_signed", stamp: "agreement_signed" },
} as const;

export type ProspectAction = "request_agreement" | "mark_signed" | "onboard" | "undo";

/** The status an action must start from, and the status it lands on. */
export function transitionFor(
  action: ProspectAction,
  current: ProspectStatus,
): { to: ProspectStatus; clear?: "agreement_requested" | "agreement_signed" } | null {
  switch (action) {
    case "request_agreement":
      return current === "prospect" ? { to: "agreement_requested" } : null;
    case "mark_signed":
      return current === "agreement_requested" ? { to: "agreement_signed" } : null;
    case "onboard":
      return current === "agreement_signed" ? { to: "onboarded" } : null;
    case "undo":
      // Onboarded is not undoable here: by then a live builder row exists and
      // is managed (deactivated) from the Builders list.
      if (current === "agreement_requested") return { to: "prospect", clear: "agreement_requested" };
      if (current === "agreement_signed") return { to: "agreement_requested", clear: "agreement_signed" };
      return null;
  }
}

export function isProspectAction(v: unknown): v is ProspectAction {
  return v === "request_agreement" || v === "mark_signed" || v === "onboard" || v === "undo";
}

// Mailbox providers — a domain here identifies a person, not a supplier, so it
// must never become a builders.sender_domains entry (the aggregator would then
// attribute every gmail stocklist to this firm).
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "live.com.au", "yahoo.com", "yahoo.com.au", "icloud.com", "me.com",
  "bigpond.com", "bigpond.net.au", "optusnet.com.au", "proton.me", "protonmail.com",
]);

/** Bare lowercase domain from an email address or URL, or null. */
export function domainOf(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  let host: string;
  if (v.includes("@") && !v.includes("/")) {
    host = v.split("@").pop() ?? "";
  } else {
    try {
      host = new URL(/^[a-z]+:\/\//.test(v) ? v : `https://${v}`).hostname;
    } catch {
      return null;
    }
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/**
 * Domains stocklists from this firm will arrive from. Contact email domains
 * win; the website domain is used only when no email is known, because sister
 * entities share a website (both Thomas Paul Constructions offices sit on
 * thomaspaulconstructions.com but mail from tpcqld.com.au / tpca.com.au).
 */
export function stockDomainsFor(p: Pick<ProspectBuilder, "contacts" | "website">): string[] {
  const fromEmail = (p.contacts ?? [])
    .map((c) => domainOf(c.email))
    .filter((d): d is string => !!d && !PERSONAL_DOMAINS.has(d));
  const unique = [...new Set(fromEmail)];
  if (unique.length) return unique;
  const site = domainOf(p.website);
  return site && !PERSONAL_DOMAINS.has(site) ? [site] : [];
}

/** First contact email / phone, for the builder row's contact fields. */
export function primaryContact(p: Pick<ProspectBuilder, "contacts">): { email: string | null; phone: string | null } {
  const cs = p.contacts ?? [];
  return {
    email: cs.find((c) => c.email)?.email ?? null,
    phone: cs.find((c) => c.phone)?.phone ?? null,
  };
}

export function prospectTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
