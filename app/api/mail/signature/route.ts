/**
 * GET /api/mail/signature
 *   Returns the rendered HTML + plain-text signature for the current user.
 *
 * The composer calls this once on mount and prepends the result into the
 * body editor so the user can type above their own signature — Gmail-style.
 * The send path then trusts the draft body as-is and does NOT re-append.
 */
import { NextResponse } from "next/server";
import { defaultSignature } from "../../../../utils/email-signature";

export const dynamic = "force-dynamic";

export async function GET() {
  const sig = await defaultSignature();
  return NextResponse.json({ ok: true, html: sig.html, text: sig.text });
}
