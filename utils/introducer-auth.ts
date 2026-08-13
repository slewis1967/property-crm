/**
 * Introducer portal — authentication.
 *
 * Server-only (imports the service-role Supabase client).
 *
 * WHY NOT CLOUDFLARE ACCESS. Every other human in this CRM is staff, and CF
 * Access is the right gate for them. Introducers are external, are onboarded and
 * offboarded by us continuously, and must never hold an identity that satisfies
 * the CRM's own gate — one policy mistake in the Cloudflare dashboard would put
 * a third party inside the whole CRM. So the portal runs on its own session,
 * behind its own CF Access carve-out (see isPublicIntroducerRoute in proxy.ts),
 * and an introducer credential is worthless anywhere else in the system.
 *
 * THE CREDENTIAL CHAIN
 *   1. Introducer enters their email.
 *   2. We mint two single-use credentials for the same login attempt: a 256-bit
 *      link token and a 6-digit code. Only SHA-256 hashes are stored.
 *   3. Redeeming either mints a session; the raw session token lives only in an
 *      httpOnly cookie, and again only its hash is stored.
 *   4. Every request re-resolves the session AND re-checks that both the user
 *      and the firm are still active, so revocation takes effect immediately.
 *
 * There is no password anywhere in this flow, so there is nothing to leak, reset
 * or reuse from another breach.
 */

import { randomInt } from "node:crypto";
import { createHash } from "node:crypto";
import { supabase } from "./supabase";
import { newToken, hashToken, safeEqual } from "./sign-token";
import { introducerTablesMissing } from "./introducer";

/** Session cookie. `__Host-` prefix pins it to this exact origin, path `/`, secure. */
export const INTRODUCER_COOKIE = "__Host-nk_introducer";
/** Dev fallback: `__Host-` requires HTTPS, which local dev doesn't have. */
export const INTRODUCER_COOKIE_DEV = "nk_introducer";

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? INTRODUCER_COOKIE : INTRODUCER_COOKIE_DEV;
}

/** How long a sign-in code is good for. Short — it's a live login attempt. */
const CODE_TTL_MS = 15 * 60_000;
/** Wrong guesses tolerated per issued code before the row is dead. */
const MAX_CODE_ATTEMPTS = 5;
/** Codes a single user may request in a rolling window, to stop mail-bombing. */
const MAX_CODES_PER_WINDOW = 5;
const CODE_REQUEST_WINDOW_MS = 15 * 60_000;
/** Session lifetime. Long enough not to nag a weekly user, short enough to matter. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
/** Sliding renewal: a session seen inside this window gets its clock extended. */
const SESSION_RENEW_AFTER_MS = 24 * 60 * 60_000;

export type IntroducerIdentity = {
  sessionId: string;
  userId: string;
  introducerId: string;
  email: string;
  fullName: string | null;
  firmName: string;
  isPrimary: boolean;
};

export type LoginChallenge = {
  userId: string;
  email: string;
  fullName: string | null;
  firmName: string;
  /** Raw link token — goes in the emailed URL and is never persisted. */
  linkToken: string;
  /** Raw 6-digit code — emailed, never persisted. */
  code: string;
  expiresAt: Date;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** 6 digits, uniformly random, zero-padded. `randomInt` is CSPRNG-backed. */
function newNumericCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function normaliseEmail(input: unknown): string {
  return typeof input === "string" ? input.trim().toLowerCase() : "";
}

/**
 * Start a login. Returns null when there is no active introducer login for this
 * email, or when the request cap has been hit.
 *
 * IMPORTANT — the CALLER must return an identical "check your email" response
 * whether this resolves to a challenge or to null. A different response for an
 * unknown address turns the login form into a directory of who our introducers
 * are, which is exactly the sort of thing a competitor would enumerate.
 */
export async function beginLogin(
  emailInput: unknown,
  opts: { ip?: string | null } = {},
): Promise<LoginChallenge | null> {
  const email = normaliseEmail(emailInput);
  if (!email || email.length > 320) return null;

  const { data: user, error } = await supabase
    .from("introducer_users")
    .select("id,introducer_id,email,full_name,status,introducers(firm_name,status)")
    .eq("email", email)
    .maybeSingle();

  if (introducerTablesMissing(error)) {
    // Every sign-in would fail identically and silently — the caller can't tell
    // this apart from "unknown address" by design, so the platform log is the
    // only place this can surface. Say it loudly.
    console.error(
      "[introducer] migrations/20260811_introducer_portal.sql has not been applied — " +
        "no introducer can sign in until it is run in the Supabase SQL editor.",
    );
    return null;
  }
  if (error || !user) return null;
  if (user.status !== "active") return null;

  // Supabase types an embedded to-one relation as an array in some client
  // versions; normalise both shapes rather than trusting one.
  const firmRaw = (user as unknown as { introducers?: unknown }).introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { firm_name?: string; status?: string }
    | undefined;
  if (!firm || firm.status !== "active") return null;

  // Throttle at the DATABASE, not in process memory: Netlify may run several
  // instances of this function, and an in-memory counter would let each one
  // issue a fresh allowance.
  const since = new Date(Date.now() - CODE_REQUEST_WINDOW_MS).toISOString();
  const { count } = await supabase
    .from("introducer_login_codes")
    .select("id", { count: "exact", head: true })
    .eq("introducer_user_id", user.id)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_CODES_PER_WINDOW) return null;

  // Any earlier live code for this user is retired the moment a new one is
  // issued, so only the most recent email ever works.
  await supabase
    .from("introducer_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("introducer_user_id", user.id)
    .is("consumed_at", null);

  const link = newToken();
  const code = newNumericCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  const { error: insErr } = await supabase.from("introducer_login_codes").insert({
    introducer_user_id: user.id,
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
    firmName: firm.firm_name ?? "",
    linkToken: link.raw,
    code,
    expiresAt,
  };
}

type CodeRow = {
  id: string;
  introducer_user_id: string;
  link_token_hash: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  consumed_at: string | null;
};

export type LoginResult =
  | { ok: true; sessionToken: string; identity: IntroducerIdentity }
  | { ok: false; error: string };

const GENERIC_LOGIN_FAILURE =
  "That sign-in link or code is not valid. Please request a new one.";

/** Redeem the emailed link. The raw token is the credential; we look up its hash. */
export async function redeemLinkToken(
  raw: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginResult> {
  if (!raw || typeof raw !== "string" || raw.length < 20) {
    return { ok: false, error: GENERIC_LOGIN_FAILURE };
  }
  const { data, error } = await supabase
    .from("introducer_login_codes")
    .select("id,introducer_user_id,link_token_hash,code_hash,attempts,expires_at,consumed_at")
    .eq("link_token_hash", hashToken(raw))
    .maybeSingle();

  if (error || !data) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  return finishLogin(data as CodeRow, meta);
}

/**
 * Redeem the 6-digit code. Requires the email too, so a guessed code is useless
 * without knowing whose it is — and each wrong guess burns one of five attempts
 * on that specific row.
 */
export async function redeemCode(
  emailInput: unknown,
  codeInput: unknown,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<LoginResult> {
  const email = normaliseEmail(emailInput);
  const code = typeof codeInput === "string" ? codeInput.replace(/\D/g, "") : "";
  if (!email || code.length !== 6) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data: user } = await supabase
    .from("introducer_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!user) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data, error } = await supabase
    .from("introducer_login_codes")
    .select("id,introducer_user_id,link_token_hash,code_hash,attempts,expires_at,consumed_at")
    .eq("introducer_user_id", user.id)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  const row = data as CodeRow;

  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    // Burn the row so it can't be ground down further.
    await supabase
      .from("introducer_login_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  if (!safeEqual(sha256(code), row.code_hash)) {
    await supabase
      .from("introducer_login_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { ok: false, error: GENERIC_LOGIN_FAILURE };
  }

  return finishLogin(row, meta);
}

/**
 * Shared tail of both redemption paths: validate the row is still live, consume
 * it atomically, re-verify the account is active, and mint a session.
 */
async function finishLogin(
  row: CodeRow,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<LoginResult> {
  if (row.consumed_at) return { ok: false, error: GENERIC_LOGIN_FAILURE };
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "That sign-in link has expired. Please request a new one." };
  }

  // Consume with the unconsumed state in the WHERE clause, so two concurrent
  // redemptions of the same link can't both mint a session — the second update
  // matches zero rows.
  const { data: consumed, error: consumeErr } = await supabase
    .from("introducer_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeErr || !consumed) return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const { data: user } = await supabase
    .from("introducer_users")
    .select("id,introducer_id,email,full_name,is_primary,status,introducers(firm_name,status)")
    .eq("id", row.introducer_user_id)
    .maybeSingle();
  if (!user || user.status !== "active") return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const firmRaw = (user as unknown as { introducers?: unknown }).introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { firm_name?: string; status?: string }
    | undefined;
  if (!firm || firm.status !== "active") return { ok: false, error: GENERIC_LOGIN_FAILURE };

  const session = newToken();
  const { data: created, error: sessErr } = await supabase
    .from("introducer_sessions")
    .insert({
      token_hash: session.hash,
      introducer_user_id: user.id,
      introducer_id: user.introducer_id,
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      issued_ip: meta.ip ?? null,
      user_agent_hash: meta.userAgent ? sha256(meta.userAgent) : null,
    })
    .select("id")
    .single();
  if (sessErr || !created) return { ok: false, error: "Could not start your session. Please try again." };

  await supabase
    .from("introducer_users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", user.id);

  return {
    ok: true,
    sessionToken: session.raw,
    identity: {
      sessionId: created.id,
      userId: user.id,
      introducerId: user.introducer_id,
      email: user.email,
      fullName: user.full_name ?? null,
      firmName: firm.firm_name ?? "",
      isPrimary: Boolean(user.is_primary),
    },
  };
}

/**
 * Resolve a raw session token to an identity, or null.
 *
 * Re-checks user status AND firm status on every call rather than trusting what
 * was true at login: suspending an introducer has to lock them out now, not in
 * thirty days when their cookie happens to expire.
 */
export async function resolveSession(rawToken: string | null | undefined): Promise<IntroducerIdentity | null> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 20) return null;

  const { data: row, error } = await supabase
    .from("introducer_sessions")
    .select(
      "id,introducer_user_id,introducer_id,expires_at,revoked_at,last_seen_at," +
        "introducer_users(id,email,full_name,is_primary,status,introducers(firm_name,status))",
    )
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();

  if (error || !row) return null;
  // Double cast: the Supabase client can't infer a row shape from a select with
  // a nested embed, so it falls back to a union including its own error type.
  const data = row as unknown as {
    id: string;
    introducer_id: string;
    expires_at: string;
    revoked_at: string | null;
    last_seen_at: string;
    introducer_users?: unknown;
  };
  if (data.revoked_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const userRaw = data.introducer_users;
  const user = (Array.isArray(userRaw) ? userRaw[0] : userRaw) as
    | {
        id: string;
        email: string;
        full_name: string | null;
        is_primary: boolean;
        status: string;
        introducers?: unknown;
      }
    | undefined;
  if (!user || user.status !== "active") return null;

  const firmRaw = user.introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { firm_name?: string; status?: string }
    | undefined;
  if (!firm || firm.status !== "active") return null;

  // Sliding expiry, written at most once a day so an active user isn't logged
  // out mid-referral but we aren't writing to the row on every request either.
  const lastSeen = new Date(data.last_seen_at).getTime();
  if (Date.now() - lastSeen > SESSION_RENEW_AFTER_MS) {
    await supabase
      .from("introducer_sessions")
      .update({
        last_seen_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      })
      .eq("id", data.id);
  }

  return {
    sessionId: data.id,
    userId: user.id,
    introducerId: data.introducer_id,
    email: user.email,
    fullName: user.full_name,
    firmName: firm.firm_name ?? "",
    isPrimary: Boolean(user.is_primary),
  };
}

/** Sign out one session (this browser). */
export async function revokeSession(rawToken: string, reason = "signed_out"): Promise<void> {
  if (!rawToken) return;
  await supabase
    .from("introducer_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("token_hash", hashToken(rawToken))
    .is("revoked_at", null);
}

/** Kill every live session for a user — used when suspending or removing them. */
export async function revokeAllSessionsForUser(userId: string, reason: string): Promise<void> {
  await supabase
    .from("introducer_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("introducer_user_id", userId)
    .is("revoked_at", null);
}

/** Kill every live session across a firm — used when suspending the firm. */
export async function revokeAllSessionsForFirm(introducerId: string, reason: string): Promise<void> {
  await supabase
    .from("introducer_sessions")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("introducer_id", introducerId)
    .is("revoked_at", null);
}

/** Cookie attributes shared by set and clear, so they can't drift apart. */
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

/** Client IP, as far as we can trust it behind Cloudflare + Netlify. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}
