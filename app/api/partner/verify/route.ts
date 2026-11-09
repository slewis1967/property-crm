/**
 * Redeem a sign-in credential and start a portal session.
 *
 *   POST /api/partner/verify  { token }        — from the confirm page the emailed link opens
 *   POST /api/partner/verify  { email, code }  — the 6-digit fallback
 *   GET  /api/partner/verify?t=<token>         — never redeems; forwards to the confirm page
 *
 * PUBLIC. WHY THE LINK DOESN'T SIGN YOU IN ON CLICK. Mail security gateways at
 * the sort of firms we partner with (Mimecast, Proofpoint, Defender) open every
 * link on delivery. If a GET redeemed, the scanner would burn the credential —
 * link AND code, they share a row — so the human gets "not valid" either way,
 * and the scanner would be holding a live 30-day session. So the emailed link
 * goes to /partner/verify, a page with a button, and only this POST redeems.
 * Scanners fetch; they don't press buttons.
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
} from "../../../../utils/partner-auth";
import { logPartnerEvent } from "../_shared";
import { enforceRateLimit } from "../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

/** A link opened straight at the API still works — it just lands on the confirm page. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const to = new URL("/partner/verify", url.origin);
  const t = url.searchParams.get("t");
  if (t) to.searchParams.set("t", t);
  return NextResponse.redirect(to, { status: 303 });
}

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 20,
    keyFn: () => `partner-verify:${clientIp(req) ?? "unknown"}`,
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
    // A second, per-address gate. In-memory and per-instance like the one
    // above, so it is not the control — the compare-and-set attempt counter in
    // redeemCode is — but it blunts a spray from many IPs at one mailbox.
    const perEmail = enforceRateLimit(req, {
      windowMs: 15 * 60_000,
      max: 10,
      keyFn: () => `partner-verify-email:${normaliseEmail(body.email)}`,
    });
    if (perEmail) return perEmail;
    method = "code";
    result = await redeemCode(body.email, body.code, meta);
  }

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 401 });

  await logPartnerEvent({
    partnerId: result.partnerId,
    actorType: "partner",
    actor: result.email,
    action: "signed_in",
    detail: { method, ip: clientIp(req) },
  });

  const res = NextResponse.json({ ok: true, redirect: "/partner/stock" });
  res.cookies.set(sessionCookieName(), result.sessionToken, sessionCookieOptions(SESSION_MAX_AGE_SECONDS));
  return res;
}
