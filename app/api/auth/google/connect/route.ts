import { NextRequest, NextResponse } from "next/server";
import { buildAuthorizeUrl } from "../../../../../utils/google-oauth";

/**
 * Kicks off the Google OAuth consent flow. The host email is round-tripped
 * through the `state` param so the callback knows which host the resulting
 * refresh token belongs to. After authorize, Google redirects to
 * /api/auth/google/callback?code=…&state=<host_email>.
 */
export async function GET(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host");
  if (!host || !host.includes("@")) {
    return NextResponse.json({ error: "host email is required" }, { status: 400 });
  }
  // Encode host into state. We're not preventing CSRF here because the
  // callback also verifies the resulting account matches the requested
  // host before saving the token.
  const state = encodeURIComponent(host);
  const url = buildAuthorizeUrl(state);
  return NextResponse.redirect(url);
}
