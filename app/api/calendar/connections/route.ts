import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";

/**
 * Both handlers are gated on requireAuth. Cloudflare Access sits in front of
 * the app, but these routes were the only calendar endpoints not enforcing it
 * themselves — leaving an unauthenticated request that reached the origin
 * directly able to enumerate host emails or disconnect a calendar.
 */

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabase
    .from("calendar_credentials")
    .select("host_email, display_name, scope, connected_at, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const host = req.nextUrl.searchParams.get("host");
  if (!host) return NextResponse.json({ error: "host is required" }, { status: 400 });
  const { error } = await supabase
    .from("calendar_credentials")
    .delete()
    .eq("host_email", host);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
