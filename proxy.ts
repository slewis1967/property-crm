import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Cloudflare Access auth gate for the Property CRM (Next 16 `proxy` convention).
 *
 * AUTH_MODE controls behaviour:
 *   local  — no auth (default; safe for `npm run dev` on Sean's workstation)
 *   tunnel — require Cloudflare Access headers on every request except those
 *            explicitly exempted below
 *
 * When the tunnel is up, Cloudflare Access authenticates the user (Google SSO
 * / magic-link) and adds these headers. Trusting their presence is enough as
 * long as Next binds only to localhost — any external reach must come through
 * the tunnel, where Cloudflare adds these headers itself.
 *
 * Set AUTH_MODE=tunnel in `.env.local` (or in the production environment) to
 * enable enforcement. Default is `local`.
 */

const PUBLIC_PATHS = new Set<string>([
  // Add any explicitly-public routes here. Currently none — even the war
  // room dashboard requires Sean to be authenticated.
]);

export function proxy(req: NextRequest) {
  const mode = (process.env.AUTH_MODE ?? "local").toLowerCase();
  if (mode !== "tunnel") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;
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
