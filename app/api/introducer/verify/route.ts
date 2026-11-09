/**
 * Redeem a sign-in credential and start a portal session.
 *
 *   POST /api/introducer/verify  { token }        — from the confirm page the emailed link opens
 *   POST /api/introducer/verify  { email, code }  — the 6-digit fallback
 *   GET  /api/introducer/verify?t=<token>         — never redeems; forwards to the confirm page
 *
 * PUBLIC. WHY THE LINK DOESN'T SIGN YOU IN ON CLICK. Mail security gateways
 * (Mimecast, Proofpoint, Defender) open every link on delivery. This GET used to
 * redeem, which meant a scanner burned the credential — link AND code, they
 * share a row — so the human got "not valid" either way, and the scanner was
 * left holding a live 30-day session. The link now lands on /introducer/verify,
 * a page with a button, and only this POST redeems. Scanners fetch; they don't
 * press buttons. (Ported from the partner portal, security review 2026-09-11.)
 *
 * Links already sitting in inboxes keep working — the GET forwards to that page.
 *
 * Cookies are set in a route handler because server components cannot set them.
 */
import { NextResponse } from "next/server";
import {
  redeemLinkToken,
  redeemCode,
  clientIp,
  normaliseEmail,
  sessionCookieName,
  sessionCookieOptions,
  SESSION_MAX_AGE_SECONDS,
} from "../../../../utils/introducer-auth";
import { logIntroducerEvent } from "../_shared";
import { enforceRateLimit } from "../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = new URL("/introducer/verify", url.origin);
  const t = url.searchParams.get("t");
  if (t) to.searchParams.set("t", t);
  return NextResponse.redirect(to, { status: 303 });
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 20,
    keyFn: () => `introducer-verify:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { token?: unknown; email?: unknown; code?: unknown };
  const meta = { ip: clientIp(req), userAgent: req.headers.get("user-agent") };

  let method: "link" | "code";
  let result;
  if (typeof body.token === "string") {
    method = "link";
    result = await redeemLinkToken(body.token, meta);
  } else {
    // A second, per-address gate. In-memory and per-instance, so it is not the
    // control — the compare-and-set attempt counter in redeemCode is — but it
    // blunts a spray from many IPs at one mailbox.
    const perEmail = enforceRateLimit(req, {
      windowMs: 15 * 60_000,
      max: 10,
      keyFn: () => `introducer-verify-email:${normaliseEmail(body.email)}`,
    });
    if (perEmail) return perEmail;
    method = "code";
    result = await redeemCode(body.email, body.code, meta);
  }

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });

  await logIntroducerEvent({
    introducerId: result.identity.introducerId,
    actorType: "introducer",
    actor: result.identity.email,
    action: "signed_in",
    detail: { method, ip: clientIp(req) },
  });

  const res = NextResponse.json({ ok: true, redirect: "/introducer/clients" });
  res.cookies.set(sessionCookieName(), result.sessionToken, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return res;
}
