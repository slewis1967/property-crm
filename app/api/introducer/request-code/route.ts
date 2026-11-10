/**
 * POST /api/introducer/request-code   Body: { email }
 *
 * PUBLIC. Starts a portal sign-in: mints a one-time link + 6-digit code and
 * emails them.
 *
 * ALWAYS returns the same success envelope, whether or not the address belongs
 * to an active introducer. The response must not reveal who our introducers are
 * — that list is commercially sensitive, and confirming an address also tells an
 * attacker which mailbox is worth compromising.
 */
import { NextResponse } from "next/server";
import { beginLogin, clientIp } from "../../../../utils/introducer-auth";
import { sendIntroducerLoginEmail } from "../../../../utils/introducer-email";
import { enforceRateLimit } from "../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

const SAME_ANSWER = {
  ok: true,
  message: "If that email has portal access, we've sent a sign-in link and code. It expires in 15 minutes.",
};

export async function POST(req: Request) {
  // Cheap first gate. The durable cap is per-user and lives in the database
  // (beginLogin), because this in-memory limiter is per function instance.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 10,
    keyFn: () => `introducer-login:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const challenge = await beginLogin((body as { email?: unknown }).email, { ip: clientIp(req) });

  if (challenge) {
    const sent = await sendIntroducerLoginEmail({
      to: challenge.email,
      name: challenge.fullName,
      linkToken: challenge.linkToken,
      code: challenge.code,
      expiresAt: challenge.expiresAt,
    });
    if (!sent.ok) {
      // The code exists but the email didn't go. Say so — this one is a genuine
      // system failure, not an enumeration signal, and silently returning
      // "check your email" would leave them staring at an empty inbox.
      console.error("[introducer] login email failed", { error: sent.error });
      return NextResponse.json(
        { ok: false, error: "We couldn't send the sign-in email just now. Please try again shortly." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(SAME_ANSWER);
}
