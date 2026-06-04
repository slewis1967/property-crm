/**
 * GET /api/mail/signature
 *   Returns the rendered HTML + plain-text signature for the CURRENT
 *   Cloudflare-Access user. Composer calls this once on mount.
 */
import { NextResponse } from "next/server";
import { defaultSignature } from "../../../../utils/email-signature";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await userEmailFromRequest(req);
  const sig = await defaultSignature(owner);
  return NextResponse.json({ ok: true, html: sig.html, text: sig.text, user_email: owner });
}
