/**
 * Redeem a sign-in credential and start a portal session.
 *
 *   GET  /api/introducer/verify?t=<link-token>   — the emailed button
 *   POST /api/introducer/verify  { email, code } — the 6-digit fallback
 *
 * PUBLIC. The GET is a state-changing GET, which is normally a smell; it is the
 * standard shape for an emailed sign-in link and is safe here because the token
 * is single-use and unguessable, so a prefetch or a mis-click can at worst
 * consume a credential the recipient already holds.
 *
 * Both paths set the session cookie in a route handler — server components
 * cannot set cookies in Next 15, which is why the emailed link points at an API
 * route rather than a page.
 */
import { NextResponse } from "next/server";
import {
  redeemLinkToken,
  redeemCode,
  clientIp,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "../../../../utils/introducer-auth";
import { logIntroducerEvent } from "../_shared";
import { enforceRateLimit } from "../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

function meta(req: Request) {
  return { ip: clientIp(req), userAgent: req.headers.get("user-agent") };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  const result = await redeemLinkToken(token, meta(req));

  if (!result.ok) {
    // Bounce back to the sign-in page with the reason, rather than rendering an
    // error JSON blob at a URL the user clicked from their email.
    const back = new URL("/introducer", url.origin);
    back.searchParams.set("error", result.error);
    return NextResponse.redirect(back, { status: 303 });
  }

  await logIntroducerEvent({
    introducerId: result.identity.introducerId,
    actorType: "introducer",
    actor: result.identity.email,
    action: "signed_in",
    detail: { method: "link", ip: clientIp(req) },
  });

  const res = NextResponse.redirect(new URL("/introducer/clients", url.origin), { status: 303 });
  res.cookies.set(sessionCookieName(), result.sessionToken, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return res;
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 20,
    keyFn: () => `introducer-verify:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; code?: unknown };
  const result = await redeemCode(body.email, body.code, meta(req));

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }

  await logIntroducerEvent({
    introducerId: result.identity.introducerId,
    actorType: "introducer",
    actor: result.identity.email,
    action: "signed_in",
    detail: { method: "code", ip: clientIp(req) },
  });

  const res = NextResponse.json({ ok: true, redirect: "/introducer/clients" });
  res.cookies.set(sessionCookieName(), result.sessionToken, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return res;
}
