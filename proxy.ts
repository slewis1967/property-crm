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

// Cloudflare Access verification config. CF_ACCESS_TEAM_DOMAIN is either the
// team name ("nextkey") or the full "https://nextkey.cloudflareaccess.com".
// CF_ACCESS_AUD is the Application Audience tag from the Access app.
const CF_TEAM_RAW = (process.env.CF_ACCESS_TEAM_DOMAIN ?? "").trim();
const CF_AUD = (process.env.CF_ACCESS_AUD ?? "").trim();
const CF_ISSUER = CF_TEAM_RAW
  ? CF_TEAM_RAW.startsWith("http")
    ? CF_TEAM_RAW.replace(/\/$/, "")
    : `https://${CF_TEAM_RAW}.cloudflareaccess.com`
  : "";
const CF_VERIFY_ENABLED = Boolean(CF_ISSUER && CF_AUD);
// createRemoteJWKSet caches keys internally — build it once at module scope.
const CF_JWKS = CF_VERIFY_ENABLED
  ? createRemoteJWKSet(new URL(`${CF_ISSUER}/cdn-cgi/access/certs`))
  : null;

async function cfJwtVerified(jwt: string, email: string): Promise<boolean> {
  if (!CF_VERIFY_ENABLED || !CF_JWKS) {
    // Not configured — can't cryptographically verify. Fail back to the
    // previous presence-trust behaviour but make the gap loud.
    log.error("cf_access.jwt_verification_disabled", {
      detail: "Set CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD to enable signature verification",
      email,
    });
    return true;
  }
  try {
    const { payload } = await jwtVerify(jwt, CF_JWKS, {
      issuer: CF_ISSUER,
      audience: CF_AUD,
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

  if (PUBLIC_PATHS.has(pathname)) {
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
