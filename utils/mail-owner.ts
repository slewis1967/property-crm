/**
 * resolveOwner — map a NextKey email address (or list of addresses from
 * To/Cc/Bcc) to the canonical user_email in email_user_aliases.
 *
 * Returns null when no match is found — caller can fall back to a default
 * (e.g. shared inbox) or skip per-user routing. The resolver is intentionally
 * forgiving:
 *   - case-insensitive
 *   - whitespace tolerant
 *   - splits comma-separated To/Cc strings
 *   - checks user_email AND aliases[] so future routing additions don't
 *     need code changes (just a row update)
 *
 * The result is cached per-process for 60s — the alias map changes rarely
 * and an extra round-trip to Supabase on every email send is wasted work.
 */
import { supabase } from "./supabase";

type AliasRow = {
  user_email: string;
  aliases: string[] | null;
  active: boolean | null;
};

let cache: { fetchedAt: number; rows: AliasRow[] } | null = null;
const CACHE_TTL_MS = 60_000;

async function loadAliases(): Promise<AliasRow[]> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  const { data, error } = await supabase
    .from("email_user_aliases")
    .select("user_email, aliases, active")
    .eq("active", true);
  if (error) {
    console.warn("[mail-owner] alias load failed:", error.message);
    return cache?.rows ?? []; // fail-open with previous cache if any
  }
  cache = { fetchedAt: now, rows: data ?? [] };
  return cache.rows;
}

function extractEmail(s: string): string {
  // Handle "Name <email@x.com>" and bare emails alike. Lowercase + trim.
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}

function splitAddresses(input: string | string[] | null | undefined): string[] {
  if (!input) return [];
  const raw = Array.isArray(input) ? input.join(",") : input;
  return raw
    .split(/[,;]/)
    .map(extractEmail)
    .filter(Boolean);
}

/**
 * Given any combination of To/Cc/Bcc strings, find the first NextKey user
 * the message belongs to. Returns the canonical user_email or null.
 */
export async function resolveOwner(
  ...addresses: Array<string | string[] | null | undefined>
): Promise<string | null> {
  const candidates = addresses.flatMap(splitAddresses);
  if (candidates.length === 0) return null;
  const rows = await loadAliases();
  for (const candidate of candidates) {
    for (const r of rows) {
      if (r.user_email.toLowerCase() === candidate) return r.user_email;
      if (r.aliases?.some((a) => a.toLowerCase() === candidate)) return r.user_email;
    }
  }
  return null;
}

/**
 * Same as resolveOwner but biased toward the sender — used on outbound mail
 * where we know who sent it from CF-Access auth, not from the To address.
 * If the sent_by header is one of our users (or their alias), return it;
 * otherwise null.
 */
export async function resolveSender(sentBy: string | null | undefined): Promise<string | null> {
  if (!sentBy) return null;
  return resolveOwner(sentBy);
}
