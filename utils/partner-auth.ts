/**
 * Channel-partner portal — authentication.
 *
 * Server-only (imports the service-role Supabase client).
 *
 * The same credential chain as the introducer portal (utils/introducer-auth.ts),
 * against its own tables — read that file's header for the full reasoning.
 * In short: partners are external, so they never hold a Cloudflare Access
 * identity (one over-broad CF policy would put them inside the whole CRM).
 * They sign in with an emailed one-time link or 6-digit code; only SHA-256
 * hashes are stored; the session token lives in an httpOnly `__Host-` cookie;
 * and every request re-checks that the user AND the firm are still active, so
 * suspending either locks them out immediately.
 *
 * WHY A SEPARATE MODULE AND NOT A SHARED ONE. The introducer portal is live and
 * carries accreditation state this portal has nothing to do with. Parameterising
 * that module by table name would put a live login path at risk to save a few
 * hundred lines. The two copies must stay in step on the security properties
 * listed above; `utils/partner-auth.test.ts` pins them for this one.
 *
 * TWO HARDENINGS THE INTRODUCER COPY DOESN'T HAVE YET (found in review,
 * 2026-09-11): the code's attempt counter is spent with a compare-and-set
 * before the comparison (see redeemCode), and the emailed link lands on a
 * confirm page that POSTs, so a mail scanner that opens links can't burn the
 * credential or collect a session (see app/partner/verify).
 */

import { randomInt, createHash } from "node:crypto";
import { supabase } from "./supabase";
import { newToken, hashToken, safeEqual } from "./sign-token";
import {
  featuresFor,
  normaliseTier,
  partnerTablesMissing,
  resolveBranding,
  type PartnerBranding,
  type PartnerFeature,
  type PartnerTier,
} from "./partner";

export const PARTNER_COOKIE = "__Host-nk_partner";
/** Dev fallback: `__Host-` requires HTTPS, which local dev doesn't have. */
export const PARTNER_COOKIE_DEV = "nk_partner";

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? PARTNER_COOKIE : PARTNER_COOKIE_DEV;
}

const CODE_TTL_MS = 15 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CODES_PER_WINDOW = 5;
const CODE_REQUEST_WINDOW_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const SESSION_RENEW_AFTER_MS = 24 * 60 * 60_000;

export type PartnerIdentity = {
  sessionId: string;
  userId: string;
  partnerId: string;
  email: string;
  fullName: string | null;
  firmName: string;
  isPrimary: boolean;
  tier: PartnerTier;
  /** Tier features plus on-request grants. Resolved server-side, never from the caller. */
  features: PartnerFeature[];
  /** NextKey's branding unless the firm holds white_label. */
  branding: PartnerBranding;
};

export type LoginChallenge = {
  userId: string;
  email: string;
  fullName: string | null;
  /** Raw link token — goes in the emailed URL and is never persisted. */
  linkToken: string;
  /** Raw 6-digit code — emailed, never persisted. */
  code: string;
  expiresAt: Date;
};

type FirmRow = {
  firm_name?: string;
  status?: string;
  tier?: string;
  feature_grants?: unknown;
  branding?: unknown;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function newNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normaliseEmail(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

/** Supabase types a to-one embed as an array in some client versions. */
function one<T>(raw: unknown): T | undefined {
  return (Array.isArray(raw) ? raw[0] : raw) as T | undefined;
}

/**
 * Start a login. Returns null when there is no active partner login for this
 * email or the request cap has been hit.
 *
 * The CALLER must answer identically either way — a different response for an
 * unknown address turns the form into a directory of our partners.
 */
export async function beginLogin(
  emailInput: unknown,
  opts: { ip?: string | null } = {},
): Promise<LoginChallenge | null> {
  const email = normaliseEmail(emailInput);
  if (!email || email.length > 320) return null;

  const { data: user, error } = await supabase
    .from("partner_users")
    .select("id,email,full_name,status,partners(status)")
    .eq("email", email)
    .maybeSingle();

  if (partnerTablesMissing(error)) {
    console.error(
      "[partner] migrations/20260911_partner_portal.sql has not been applied — " +
        "no partner can sign in until it is run in the Supabase SQL editor.",
    );
    return null;
  }
  if (error || !user || user.status !== "active") return null;
  if (one<FirmRow>((user as { partners?: unknown }).partners)?.status !== "active") return null;

  // Throttle in the database: Netlify may run several instances of this
  // function, and an in-memory counter would give each one a fresh allowance.
  const since = new Date(Date.now() - CODE_REQUEST_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("partner_login_codes")
    .select("id", { count: "exact", head: true })
    .eq("partner_user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_CODES_PER_WINDOW) return null;

  // Only the most recent email ever works.
  await supabase
    .from("partner_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("partner_user_id", user.id)
    .is("consumed_at", null);

  const link = newToken();
  const code = newNumericCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const { error: insErr } = await supabase.from("partner_login_codes").insert({
    partner_user_id: user.id,
    link_token_hash: link.hash,
    code_hash: sha256(code),
    expires_at: expiresAt.toISOString(),
    requested_ip: opts.ip ?? null,
  });
  if (insErr) return null;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name ?? null,
    linkToken: link.raw,
    code,
    expiresAt,
  };
}

type CodeRow = {
  id: string;
  partner_user_id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

export type LoginResult =
  | { ok: true; sessionToken: string; partnerId: string; email: string }
  | { ok: false; error: string };

const GENERIC_LOGIN_FAILURE = "That sign-in link or code is not valid. Please request a new one.";
const CODE_COLUMNS = "id,partner_user_id,code_hash,attempts,expires_at,consumed_at";

export async function redeemLinkToken(
  raw: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginResult> {
  if (!raw || typeof raw !== "string" || raw.length < 20) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  const { data, error } = await supabase
    .from("partner_login_codes")
    .select(CODE_COLUMNS)
    .eq("link_token_hash", hashToken(raw))
    .maybeSingle();
  if (error || !data) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  return finishLogin(data as CodeRow, meta);
}

/** The code needs the email too, so a guessed code is useless without knowing whose it is. */
export async function redeemCode(
  emailInput: unknown,
  codeInput: unknown,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginResult> {
  const email = normaliseEmail(emailInput);
  const code = typeof codeInput === "string" ? codeInput.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data: user } = await supabase.from("partner_users").select("id").eq("email", email).maybeSingle();
  if (!user) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data, error } = await supabase
    .from("partner_login_codes")
    .select(CODE_COLUMNS)
    .eq("partner_user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  const row = data as CodeRow;

  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await supabase
      .from("partner_login_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  // Spend the attempt BEFORE comparing, and only if the count is still the one
  // we read. Read-compare-then-increment lets N parallel guesses all read the
  // same count and all be compared, turning "5 attempts" into "5 rounds of as
  // many guesses as you can send at once". With the compare-and-set, each
  // count value is won by exactly one request, so a code gets at most
  // MAX_CODE_ATTEMPTS comparisons however the requests arrive.
  const { data: claimed } = await supabase
    .from("partner_login_codes")
    .update({ attempts: row.attempts + 1 })
    .eq("id", row.id)
    .eq("attempts", row.attempts)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  if (!safeEqual(sha256(code), row.code_hash)) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  return finishLogin(row, meta);
}

async function finishLogin(
  row: CodeRow,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  if (row.consumed_at) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "That sign-in link has expired. Please request a new one." };
  }

  // Unconsumed state in the WHERE clause: two concurrent redemptions of the same
  // credential cannot both mint a session — the second update matches no rows.
  const { data: consumed, error: consumeErr } = await supabase
    .from("partner_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeErr || !consumed) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data: user } = await supabase
    .from("partner_users")
    .select("id,partner_id,email,status,partners(status)")
    .eq("id", row.partner_user_id)
    .maybeSingle();
  if (!user || user.status !== "active") return { ok: false, error: GENERIC_LOGIN_FAILURE };
  if (one<FirmRow>((user as { partners?: unknown }).partners)?.status !== "active") {
    return { ok: false, error: GENERIC_LOGIN_FAILURE };
  }

  const session = newToken();
  const { error: sessErr } = await supabase.from("partner_sessions").insert({
    token_hash: session.hash,
    partner_user_id: user.id,
    partner_id: user.partner_id,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    issued_ip: meta.ip ?? null,
    user_agent_hash: meta.userAgent ? sha256(meta.userAgent) : null,
  });
  if (sessErr) return { ok: false, error: "Could not start your session. Please try again." };

  await supabase.from("partner_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);

  return { ok: true, sessionToken: session.raw, partnerId: user.partner_id, email: user.email };
}

const SESSION_SELECT =
  "id,partner_id,expires_at,revoked_at,last_seen_at," +
  "partner_users(id,email,full_name,is_primary,status,partners(firm_name,status,tier,feature_grants,branding))";

/**
 * Resolve a raw session token to an identity, or null. Re-checks user AND firm
 * status on every call, and resolves tier, features and branding from the firm
 * row — so a staff change to any of them applies on the partner's next click.
 */
export async function resolveSession(rawToken: string | null | undefined): Promise<PartnerIdentity | null> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 20) return null;

  const { data: row, error } = await supabase
    .from("partner_sessions")
    .select(SESSION_SELECT)
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (error || !row) return null;

  const data = row as unknown as {
    id: string;
    partner_id: string;
    expires_at: string;
    revoked_at: string | null;
    last_seen_at: string;
    partner_users?: unknown;
  };
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const user = one<{
    id: string;
    email: string;
    full_name: string | null;
    is_primary: boolean;
    status: string;
    partners?: unknown;
  }>(data.partner_users);
  if (!user || user.status !== "active") return null;

  const firm = one<FirmRow>(user.partners);
  if (!firm || firm.status !== "active") return null;

  // Sliding expiry, written at most once a day.
  if (Date.now() - new Date(data.last_seen_at).getTime() > SESSION_RENEW_AFTER_MS) {
    await supabase
      .from("partner_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      })
      .eq("id", data.id);
  }

  const firmName = firm.firm_name ?? "";
  const features = featuresFor(firm.tier, firm.feature_grants);
  return {
    sessionId: data.id,
    userId: user.id,
    partnerId: data.partner_id,
    email: user.email,
    fullName: user.full_name,
    firmName,
    isPrimary: Boolean(user.is_primary),
    tier: normaliseTier(firm.tier),
    features: [...features],
    branding: resolveBranding(firmName, features, firm.branding),
  };
}

export async function revokeSession(rawToken: string, reason = "signed_out"): Promise<void> {
  if (!rawToken) return;
  await supabase
    .from("partner_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("token_hash", hashToken(rawToken))
    .is("revoked_at", null);
}

export async function revokeAllSessionsForUser(userId: string, reason: string): Promise<void> {
  await supabase
    .from("partner_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("partner_user_id", userId)
    .is("revoked_at", null);
}

export async function revokeAllSessionsForFirm(partnerId: string, reason: string): Promise<void> {
  await supabase
    .from("partner_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("partner_id", partnerId)
    .is("revoked_at", null);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

export { clientIp } from "./introducer-auth";
