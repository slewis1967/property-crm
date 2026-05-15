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
 */
import { headers } from "next/headers";
import { NextResponse } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production";
const DEV_DEFAULT = process.env.DEV_USER_EMAIL ?? "sean.l@nextkey.com.au";
export const UNAUTHENTICATED_SENTINEL = "__unauthenticated__@invalid";

function resolveFromHeaders(get: (n: string) => string | null): string {
  const cf = get("cf-access-authenticated-user-email");
  if (cf) return cf;
  if (IS_PROD) return UNAUTHENTICATED_SENTINEL;
  // x-user-email is a dev-only override (testing as another user from a
  // local script). Never honoured in production.
  return get("x-user-email") ?? DEV_DEFAULT;
}

/** Read the authenticated user's email from a server component. */
export async function currentUserEmail(): Promise<string> {
  const h = await headers();
  return resolveFromHeaders((n) => h.get(n));
}

/** Read the authenticated user's email from a Request (API route). */
export function userEmailFromRequest(req: Request): string {
  return resolveFromHeaders((n) => req.headers.get(n));
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
 *   const auth = requireAuth(req);
 *   if (auth instanceof NextResponse) return auth;
 *   const ownerEmail = auth;
 *
 * Goal: every defence-in-depth gate adds the same three lines. Cheaper
 * to read, harder to forget. Don't use in routes that just LIST data
 * already scoped by owner_user_email — those degrade gracefully via the
 * sentinel without needing the explicit 401.
 */
export function requireAuth(req: Request): string | NextResponse {
  const email = userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json(
      { ok: false, error: "Unauthenticated" },
      { status: 401 },
    );
  }
  return email;
}
