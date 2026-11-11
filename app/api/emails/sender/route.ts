/**
 * GET /api/emails/sender — the From address the logged-in user's emails go
 * out from, so the composer can show it before they press Send. Mirrors the
 * personal-sender logic in POST /api/emails.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { getOwnSignatureFields } from "../../../../utils/email-signature";
import { resolveSender } from "../../../../utils/mail-owner";
import { personalSender } from "../../../../utils/personal-sender";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const owner = await resolveSender(auth);
  const personal = owner ? personalSender(owner, (await getOwnSignatureFields(owner))?.name) : null;
  const fallback = process.env.BREVO_SENDER_EMAIL ?? "info@nextkey.com.au";
  return NextResponse.json({
    ok: true,
    from_email: personal?.fromEmail ?? fallback,
    from_name: personal?.fromName ?? (process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists"),
    personal: personal !== null,
  });
}
