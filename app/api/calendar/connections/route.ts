import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("calendar_credentials")
    .select("host_email, display_name, scope, connected_at, updated_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ connections: data ?? [] });
}

export async function DELETE(req: NextRequest) {
  const host = req.nextUrl.searchParams.get("host");
  if (!host) return NextResponse.json({ error: "host is required" }, { status: 400 });
  const { error } = await supabase
    .from("calendar_credentials")
    .delete()
    .eq("host_email", host);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
