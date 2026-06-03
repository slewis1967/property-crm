import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

import { requireAuth } from "../../../../utils/cf-access";
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { ids, buyer_type } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (buyer_type !== undefined) update.buyer_type = buyer_type;

  const { error } = await supabase.from("contacts").update(update).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, updated: ids.length });
}
