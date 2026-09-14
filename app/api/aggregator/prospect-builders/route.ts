import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { prospectTableMissing } from "../../../../utils/prospect-builders";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await supabase
    .from("prospect_builders")
    .select("*")
    .order("company", { ascending: true });

  if (error) {
    if (prospectTableMissing(error)) {
      return NextResponse.json({
        ok: true,
        items: [],
        tableMissing: true,
        migration_hint: "Run migrations/20260914b_prospect_builders.sql",
      });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
