/**
 * POST /api/preliminary-assessments/<id>/resend   (AUTHED — CF Access)
 *
 * Email fresh signing links to the applicants who have not signed yet: a link
 * expired, went missing, or a signer declined and has changed their mind. Anyone
 * who has already signed is left alone. The rules live in resendPaSigning().
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { publicOrigin } from "../../../../../utils/public-origin";
import { resendPaSigning } from "../../../../../utils/pa-signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Each press emails clients, so keep a stuck finger from sending a dozen.
  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 5 });
  if (limited) return limited;

  const { id } = await params;
  const result = await resendPaSigning({ paId: id, origin: publicOrigin(req), createdBy: auth });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, sentTo: result.sentTo });
}
