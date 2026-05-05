import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import {
  exchangeCodeForToken,
  fetchUserInfo,
} from "../../../../../utils/google-oauth";

/**
 * Receives the OAuth code from Google, swaps it for a refresh token, and
 * stores it under the host email returned by the userinfo endpoint. We
 * also verify the authenticated email matches the host that initiated
 * the flow (passed via `state`) — bails out with a clear error if the
 * user signed in with the wrong account.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?calendar_error=${encodeURIComponent(error)}`, req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/settings?calendar_error=missing_code", req.url));
  }

  const expectedHost = state ? decodeURIComponent(state) : null;

  try {
    const tokens = await exchangeCodeForToken(code);
    if (!tokens.refresh_token) {
      // Happens if the user has previously consented and Google didn't
      // re-issue a refresh token. They need to revoke + reconnect.
      return NextResponse.redirect(new URL("/settings?calendar_error=no_refresh_token", req.url));
    }
    const profile = await fetchUserInfo(tokens.access_token);
    if (expectedHost && profile.email.toLowerCase() !== expectedHost.toLowerCase()) {
      return NextResponse.redirect(
        new URL(
          `/settings?calendar_error=${encodeURIComponent(`Connected ${profile.email} but expected ${expectedHost}`)}`,
          req.url,
        ),
      );
    }
    const { error: upsertError } = await supabase
      .from("calendar_credentials")
      .upsert({
        host_email: profile.email,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        display_name: profile.name ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "host_email" });
    if (upsertError) {
      return NextResponse.redirect(
        new URL(`/settings?calendar_error=${encodeURIComponent(upsertError.message)}`, req.url),
      );
    }
    return NextResponse.redirect(new URL("/settings?calendar_connected=" + encodeURIComponent(profile.email), req.url));
  } catch (e: any) {
    return NextResponse.redirect(
      new URL(`/settings?calendar_error=${encodeURIComponent(e.message || "callback_failed")}`, req.url),
    );
  }
}
