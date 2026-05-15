import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Cloudflare Access auth gate + CSRF origin filter for the Property CRM
 * (Next 16 `proxy` convention).
 *
 * AUTH_MODE controls auth behaviour:
 *   local  — no auth (default; safe for `npm run dev` on Sean's workstation)
 *   tunnel — require Cloudflare Access headers on every request except those
 *            explicitly exempted below
 *
 * The CSRF origin filter runs regardless of AUTH_MODE: any state-changing
 * request to /api/* with a foreign Origin is rejected. CF Access cookies
 * are SameSite=Lax which still allows top-level cross-site POSTs, so
 * Origin enforcement is the actual barrier.
 */

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

export function proxy(req: NextRequest) {
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

  const mode = (process.env.AUTH_MODE ?? "local").toLowerCase();
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
