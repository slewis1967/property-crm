/**
 * GET /api/mail/signature[?identity=nextkey|springboard]
 *   Returns the rendered HTML + plain-text signature for the CURRENT
 *   Cloudflare-Access user, for the requested sending identity. The composer
 *   calls this on mount (default nextkey) and again when the From identity
 *   changes. Unknown/absent identity falls back to nextkey.
 */
import { NextResponse } from "next/server";
import { signatureForIdentity } from "../../../../utils/email-signature";
import { isMailIdentityKey, DEFAULT_IDENTITY_KEY } from "../../../../utils/mailIdentities";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = await userEmailFromRequest(req);
  const raw = new URL(req.url).searchParams.get("identity");
  const identity = isMailIdentityKey(raw) ? raw : DEFAULT_IDENTITY_KEY;
  const sig = await signatureForIdentity(identity, owner);
  return NextResponse.json({ ok: true, html: sig.html, text: sig.text, identity, user_email: owner });
}
