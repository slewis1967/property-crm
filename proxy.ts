import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { log } from "./utils/logger";

/**
 * Cloudflare Access auth gate + CSRF origin filter for the Property CRM
 * (Next 16 `proxy` convention).
 *
 * AUTH_MODE controls auth behaviour:
 *   local  — no auth (only honoured OUTSIDE production; safe for `npm run dev`)
 *   tunnel — require Cloudflare Access on every request except those
 *            explicitly exempted below
 *
 * FAIL CLOSED: in production the auth gate is ALWAYS on, regardless of
 * AUTH_MODE. A missing/typo'd env var used to silently run the whole CRM
 * unauthenticated — production is always behind the CF tunnel, so we no
 * longer let an env var opt out of that.
 *
 * JWT VERIFICATION: the `cf-access-authenticated-user-email` header is only
 * trustworthy if the signed `cf-access-jwt-assertion` is cryptographically
 * verified against the Cloudflare team JWKS. Header *presence* alone is
 * forgeable by anyone who reaches the Netlify origin directly. We verify
 * when CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD are configured; if they're
 * not, we fall back to presence-trust (no worse than before) but log it
 * loudly so the gap is visible instead of silent.
 *
 * The CSRF origin filter runs regardless of AUTH_MODE: any state-changing
 * request to /api/* with a foreign Origin is rejected. CF Access cookies
 * are SameSite=Lax which still allows top-level cross-site POSTs, so
 * Origin enforcement is the actual barrier.
 */

// Cloudflare Access verification config.
//
// CRITICAL — env access in the edge runtime: this file is compiled into a
// Netlify Edge Function (Deno). Reading `process.env.X` at *module scope*
// in Next middleware is unreliable there — Netlify exposes runtime env via
// the `Netlify.env` global instead, and module-scope reads can resolve
// empty even when the variable is correctly configured. So we read at
// REQUEST time, trying the Netlify edge global first, then process.env
// (Node / local dev), and memoise once a value is found.
interface NetlifyEnvGlobal {
  env?: { get(key: string): string | undefined };
}

function readEnv(name: string): { value: string; viaNetlify: boolean; viaProcess: boolean } {
  const g = globalThis as unknown as { Netlify?: NetlifyEnvGlobal };
  const fromNetlify = g.Netlify?.env?.get(name);
  const fromProcess =
    typeof process !== "undefined" ? process.env?.[name] : undefined;
  const value = (fromNetlify ?? fromProcess ?? "").trim();
  return {
    value,
    viaNetlify: Boolean(fromNetlify && fromNetlify.trim()),
    viaProcess: Boolean(fromProcess && fromProcess.trim()),
  };
}

// Accept all three natural forms of the team domain so a misconfig can't
// silently break JWT verification:
//   "nextkeycrm"                              -> https://nextkeycrm.cloudflareaccess.com
//   "nextkeycrm.cloudflareaccess.com"         -> https://nextkeycrm.cloudflareaccess.com
//   "https://nextkeycrm.cloudflareaccess.com" -> unchanged
function normaliseIssuer(raw: string): string {
  if (!raw) return "";
  const v = raw.replace(/\/+$/, "");
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (v.includes(".")) return `https://${v}`;
  return `https://${v}.cloudflareaccess.com`;
}

interface CfConfig {
  issuer: string;
  aud: string;
  jwks: ReturnType<typeof createRemoteJWKSet> | null;
  enabled: boolean;
  diag: {
    team_via_netlify: boolean;
    team_via_process: boolean;
    aud_via_netlify: boolean;
    aud_via_process: boolean;
    netlify_global_present: boolean;
  };
}

// Resolved on first request, then memoised (only once enabled — a cold
// isolate that briefly lacked env can still recover on a later request).
let cfConfig: CfConfig | null = null;
function getCfConfig(): CfConfig {
  if (cfConfig?.enabled) return cfConfig;
  const team = readEnv("CF_ACCESS_TEAM_DOMAIN");
  const aud = readEnv("CF_ACCESS_AUD");
  const issuer = normaliseIssuer(team.value);
  const enabled = Boolean(issuer && aud.value);
  cfConfig = {
    issuer,
    aud: aud.value,
    enabled,
    jwks: enabled
      ? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`))
      : null,
    diag: {
      team_via_netlify: team.viaNetlify,
      team_via_process: team.viaProcess,
      aud_via_netlify: aud.viaNetlify,
      aud_via_process: aud.viaProcess,
      netlify_global_present:
        typeof (globalThis as unknown as { Netlify?: unknown }).Netlify !==
        "undefined",
    },
  };
  return cfConfig;
}

async function cfJwtVerified(jwt: string, email: string): Promise<boolean> {
  const cfg = getCfConfig();
  if (!cfg.enabled || !cfg.jwks) {
    // Can't cryptographically verify — fall back to presence-trust (no
    // worse than before) but log loudly, WITH diagnostics (booleans only,
    // never the secret values) so we can see exactly which source is empty.
    log.error("cf_access.jwt_verification_disabled", {
      detail: "CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD not readable in the edge runtime",
      ...cfg.diag,
      email,
    });
    return true;
  }
  try {
    const { payload } = await jwtVerify(jwt, cfg.jwks, {
      issuer: cfg.issuer,
      audience: cfg.aud,
    });
    const claimEmail =
      typeof payload.email === "string" ? payload.email : undefined;
    if (claimEmail && claimEmail.toLowerCase() !== email.toLowerCase()) {
      log.error("cf_access.email_claim_mismatch", { header: email, claim: claimEmail });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("cf_access.jwt_verify_failed", {
      email,
      reason: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

const PUBLIC_PATHS = new Set<string>([
  // Add any explicitly-public routes here. Currently none — even the war
  // room dashboard requires Sean to be authenticated.
]);

// Public e-signature routes. External signers reach these WITHOUT a
// Cloudflare Access identity, so they must be exempt from the CF Access
// gate. Prefix-matched (dynamic `<token>` segment) rather than added to the
// exact-match PUBLIC_PATHS set. The token itself is the unguessable bearer
// credential; each handler still validates it. The CSRF origin check above
// still applies to the mutating `/api/sign/` POSTs (they're same-origin).
export function isPublicSignRoute(pathname: string): boolean {
  // Public signer page: `/sign/<token>` (and a bare `/sign`).
  if (pathname === "/sign" || pathname.startsWith("/sign/")) return true;
  // Public token APIs `/api/sign/<token>/*`. The authed advisor routes now live
  // at `/api/signature-requests` (moved out from under this prefix so the CF
  // Access bypass on `/api/sign/*` no longer strips their auth header), so they
  // are already excluded here — `/api/signature-requests` does not start with
  // `/api/sign/`. The `/api/sign/requests` guard below is a now-moot belt-and-
  // suspenders check kept in case that legacy path is ever reintroduced.
  if (pathname.startsWith("/api/sign/") && !pathname.startsWith("/api/sign/requests")) {
    return true;
  }
  return false;
}

// Public guest video-call routes. A client joins a call WITHOUT a Cloudflare
// Access identity, so these must be exempt from the CF Access gate — same model
// as the signing routes above. Trust is the signed, expiring guest token: the
// /join page is an empty shell without one, and the guest-token API validates
// the JWT before minting anything. Must mirror the CF Access bypass apps
// (crm.nextkey.com.au/join/* + /api/livekit/guest-token) EXACTLY: the guest-token
// exemption is the single exact path, NOT all of /api/livekit/*, so the authed
// sibling routes (token, record, calls, guest-link, webhook) keep their CF
// Access auth header. The CSRF origin check above still applies to the mutating
// guest-token POST (it's same-origin from the /join page).
export function isPublicGuestRoute(pathname: string): boolean {
  if (pathname === "/join" || pathname.startsWith("/join/")) return true;
  if (pathname === "/api/livekit/guest-token") return true;
  return false;
}

// Public self-book routes. A lead picks a meeting time WITHOUT a Cloudflare
// Access identity, so the booking page and its API must be exempt — same model
// as the signing + guest-video routes. Trust: the host slug is public (like a
// Calendly link), the booking API re-validates every slot against live busy
// times, and the honeypot + slot-grid check bound abuse. Must mirror the CF
// Access bypass app (crm.nextkey.com.au/book/* + /api/book/*) EXACTLY. The CSRF
// origin check above still applies to the mutating booking POST (same-origin
// from the /book page).
export function isPublicBookingRoute(pathname: string): boolean {
  if (pathname === "/book" || pathname.startsWith("/book/")) return true;
  if (pathname.startsWith("/api/book/")) return true;
  return false;
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Trusted hosts for the Origin header on mutating /api/* calls. Production
// host plus dev hosts in non-prod. Override via TRUSTED_ORIGIN_HOSTS env.
const TRUSTED_HOSTS: Set<string> = (() => {
  const fromEnv = (process.env.TRUSTED_ORIGIN_HOSTS ?? "crm.nextkey.com.au")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV !== "production") {
    fromEnv.push("localhost", "127.0.0.1", "172.21.51.163");
  }
  return new Set(fromEnv);
})();

function originAllowed(origin: string | null): boolean {
  if (!origin) return true; // server-to-server (no Origin) — runners / scripts
  try {
    return TRUSTED_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Normalise duplicate slashes ("//path" → "/path"). A stale bookmark or
  // a Cloudflare Access redirect_url concatenation can produce URLs like
  // crm.nextkey.com.au//aggregator/runs; Next's client router then treats
  // "//aggregator/runs" as protocol-relative ("https://aggregator/runs")
  // and SecurityErrors out on history.replaceState. Fix it at the edge.
  if (pathname.includes("//")) {
    const cleaned = req.nextUrl.clone();
    cleaned.pathname = pathname.replace(/\/{2,}/g, "/");
    return NextResponse.redirect(cleaned, 301);
  }

  // CSRF: any browser-initiated cross-site mutation to /api/* gets 403,
  // regardless of auth mode. Browsers can't forge the Origin header.
  if (pathname.startsWith("/api/") && MUTATING_METHODS.has(req.method)) {
    if (!originAllowed(req.headers.get("origin"))) {
      return NextResponse.json(
        { error: "Forbidden: untrusted origin" },
        { status: 403 },
      );
    }
  }

  // Fail closed: production ALWAYS enforces the tunnel gate. AUTH_MODE can
  // only relax auth outside production (local dev). A missing env var in
  // prod can no longer drop the gate.
  const isProd = process.env.NODE_ENV === "production";
  const mode = isProd
    ? "tunnel"
    : (process.env.AUTH_MODE ?? "local").toLowerCase();
  if (mode !== "tunnel") {
    return NextResponse.next();
  }

  if (
    PUBLIC_PATHS.has(pathname) ||
    isPublicSignRoute(pathname) ||
    isPublicGuestRoute(pathname) ||
    isPublicBookingRoute(pathname)
  ) {
    return NextResponse.next();
  }

  const email = req.headers.get("cf-access-authenticated-user-email");
  const jwt = req.headers.get("cf-access-jwt-assertion");
  if (!email || !jwt) {
    return new NextResponse(
      "Unauthenticated — this CRM is only reachable through the NextKey Cloudflare tunnel.",
      { status: 401 },
    );
  }

  // Cryptographically verify the CF Access assertion. Header presence alone
  // is forgeable by anyone hitting the origin directly.
  if (!(await cfJwtVerified(jwt, email))) {
    return new NextResponse(
      "Unauthenticated — Cloudflare Access token invalid.",
      { status: 401 },
    );
  }

  // Pass-through with the user email exposed for downstream server components.
  const res = NextResponse.next();
  res.headers.set("x-user-email", email);
  return res;
}

export const config = {
  // Apply to everything except Next's static assets and image-optimisation
  // pipeline. API routes ARE matched — they need the same gate.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
