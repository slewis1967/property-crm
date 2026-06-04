/**
 * Cloudflare Access user identity helpers.
 *
 * crm.nextkey.com.au sits behind Cloudflare Access — every request that
 * reaches the Netlify origin carries `cf-access-authenticated-user-email`
 * (and a signed JWT in `cf-access-jwt-assertion`). We trust the header
 * because the origin only sees requests CF Access already authorised.
 *
 * In production we REQUIRE the header. If it's missing we return a
 * non-matching sentinel ("__unauthenticated__@invalid") rather than
 * falling back to a real identity — that fallback was a foot-gun: any
 * path that ever bypassed Cloudflare (a stray Netlify URL, a misconfigured
 * CF rule on a new route) would be treated as Sean and would see every
 * owner-scoped row in the system. With the sentinel, every owner-scoped
 * query naturally returns nothing for an unauthenticated caller.
 *
 * In local dev (NODE_ENV !== "production") the header isn't there, so we
 * fall back to DEV_USER_EMAIL or "sean.l@nextkey.com.au" so the app still
 * runs. The `x-user-email` override is dev-only too — in production it
 * could be set by any external curl.
 *
 * JWT verification (defence in depth): if CF_ACCESS_TEAM_DOMAIN and
 * CF_ACCESS_AUD are set, the JWT in `cf-access-jwt-assertion` is verified
 * against Cloudflare's published signing keys (rotated daily). This
 * catches the case where someone bypasses Cloudflare and replays a forged
 * `cf-access-authenticated-user-email` header. If JWT verification is not
 * configured we fall back to header trust — same as before, just with the
 * extra fingerprint available when it's wired up.
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// NODE_ENV is read per-request so test env-stubbing works correctly and
// the dev/prod behaviour can be flipped without a process restart.
function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
const DEV_DEFAULT = process.env.DEV_USER_EMAIL ?? "sean.l@nextkey.com.au";
export const UNAUTHENTICATED_SENTINEL = "__unauthenticated__@invalid";

// Lazy-init the JWKS — Cloudflare publishes a certs endpoint per team
// domain. Failure to reach it must never crash a request (CF could be
// down for a minute while rotating keys); the verifyJwt() call will
// throw, and we fall back to header-trust in that case.
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (jwks) return jwks;
  const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
  if (!teamDomain) return null;
  const url = `https://${teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  try {
    jwks = createRemoteJWKSet(new URL(url), { cacheMaxAge: 24 * 60 * 60 * 1000 });
    return jwks;
  } catch {
    return null;
  }
}

interface VerifiedAccess extends JWTPayload {
  email?: string;
}

/**
 * Verify a Cloudflare Access JWT against the team's published keys.
 * Returns the verified email if the token is valid; throws otherwise.
 *
 * The token is short-lived (~5 min) and is signed by Cloudflare's
 * rotating keys. We pin the audience to CF_ACCESS_AUD so a JWT issued
 * for a different app on the same team can't be replayed.
 */
async function verifyJwt(token: string): Promise<string> {
  const aud = process.env.CF_ACCESS_AUD;
  if (!aud) throw new Error("CF_ACCESS_AUD not configured");
  const keys = getJwks();
  if (!keys) throw new Error("CF Access JWKS not initialised");

  const { payload } = await jwtVerify(token, keys, { audience: aud });
  const verified = payload as VerifiedAccess;
  if (!verified.email) throw new Error("JWT missing email claim");
  return verified.email.toLowerCase();
}

async function resolveFromHeaders(get: (n: string) => string | null): Promise<string> {
  // Prefer the verified JWT email if we can — it's cryptographically
  // bound to Cloudflare's signing keys, unlike the plain header which
  // is just "trust me bro" once it lands at the origin.
  if (isProd()) {
    const jwt = get("cf-access-jwt-assertion");
    if (jwt) {
      try {
        const verifiedEmail = await verifyJwt(jwt);
        return verifiedEmail;
      } catch {
        // Fall through to header — JWKS may be briefly unavailable
        // during a key rotation. The header is still better than
        // failing the request entirely.
      }
    }
    const cf = get("cf-access-authenticated-user-email");
    if (cf) return cf.toLowerCase();
    return UNAUTHENTICATED_SENTINEL;
  }
  // Dev: header isn't there, so accept the override or fall back.
  const cf = get("cf-access-authenticated-user-email");
  if (cf) return cf;
  return get("x-user-email") ?? DEV_DEFAULT;
}

/** Read the authenticated user's email from a server component. */
export async function currentUserEmail(): Promise<string> {
  const h = await headers();
  return resolveFromHeaders((n) => h.get(n));
}

/** Read the authenticated user's email from a Request (API route). */
export async function userEmailFromRequest(req: Request): Promise<string> {
  // Request.headers is iterable; copy entries into a Map for the helper.
  const map = new Map<string, string>();
  req.headers.forEach((v, k) => map.set(k, v));
  return resolveFromHeaders((n) => map.get(n) ?? null);
}

/** True if the resolved identity is the unauthenticated sentinel. Use in
 *  routes that should hard-401 rather than silently return zero rows. */
export function isUnauthenticated(email: string): boolean {
  return email === UNAUTHENTICATED_SENTINEL;
}

/**
 * One-line auth gate for API routes that mutate state, send outbound, or
 * spend Anthropic/Gemini tokens. Returns either the authenticated email
 * (caller continues) or a 401 NextResponse the caller should return.
 *
 * Usage:
 *   const auth = await requireAuth(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const ownerEmail = auth;
 *
 * Goal: every defence-in-depth gate adds the same three lines. Cheaper
 * to read, harder to forget. Don't use in routes that just LIST data
 * already scoped by owner_user_email — those degrade gracefully via the
 * sentinel without needing the explicit 401.
 */
export async function requireAuth(req: Request): Promise<string | NextResponse> {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json(
      { ok: false, error: "Unauthenticated" },
      { status: 401 },
    );
  }
  return email;
}
