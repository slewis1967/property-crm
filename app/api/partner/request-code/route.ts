/**
 * POST /api/partner/request-code   Body: { email }
 *
 * PUBLIC. Starts a portal sign-in: mints a one-time link + 6-digit code and
 * emails them.
 *
 * ALWAYS returns the same success envelope, whether or not the address belongs
 * to an active partner. Our partner list is commercially sensitive, and
 * confirming an address also tells an attacker which mailbox is worth taking.
 */
import { NextResponse } from "next/server";
import { beginLogin, clientIp } from "../../../../utils/partner-auth";
import { sendPartnerLoginEmail } from "../../../../utils/partner-email";
import { enforceRateLimit } from "../../../../utils/rate-limit";

export const dynamic = "force-dynamic";

const SAME_ANSWER = {
  ok: true,
  message: "If that email has portal access, we've sent a sign-in link and code. It expires in 15 minutes.",
};

export async function POST(req: Request) {
  // Cheap first gate; the durable per-user cap lives in the database (beginLogin).
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 10,
    keyFn: () => `partner-login:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const challenge = await beginLogin((body as { email?: unknown }).email, { ip: clientIp(req) });

  if (challenge) {
    const sent = await sendPartnerLoginEmail({
      to: challenge.email,
      name: challenge.fullName,
      linkToken: challenge.linkToken,
      code: challenge.code,
      expiresAt: challenge.expiresAt,
    });
    if (!sent.ok) {
      // A genuine system failure, not an enumeration signal: saying "check your
      // email" here would leave them staring at an empty inbox.
      console.error("[partner] login email failed", { error: sent.error });
      return NextResponse.json(
        { ok: false, error: "We couldn't send the sign-in email just now. Please try again shortly." },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(SAME_ANSWER);
}
