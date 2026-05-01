import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { data, error } = await supabase
    .from("builders")
    .select("*")
    .order("draft", { ascending: false })
    .order("canonical_name", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
