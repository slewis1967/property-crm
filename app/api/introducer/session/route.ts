/**
 * GET /api/introducer/session
 *
 * PUBLIC (session-scoped). Who am I? Used by the portal shell to render the
 * header and to detect a session that has been revoked mid-visit.
 */
import { NextResponse } from "next/server";
import { requireIntroducer } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  return NextResponse.json({
    ok: true,
    user: {
      email: auth.email,
      name: auth.fullName,
      firm: auth.firmName,
    },
  });
}
