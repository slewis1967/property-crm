import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();

  const firstName = body.first_name?.trim() || "";
  const lastName  = body.last_name?.trim() || "";
  const fullName  = body.full_name?.trim() || [firstName, lastName].filter(Boolean).join(" ");

  if (!fullName || !body.email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  const record: Record<string, unknown> = {
    full_name:       fullName,
    name:            fullName,
    first_name:      firstName || null,
    // last_name not stored — column does not exist in Supabase contacts table
    email:           body.email,
    phone:           body.phone || null,
    buyer_type:      body.buyer_type || null,
    preferred_state: body.preferred_state || null,
    state:           body.preferred_state || null,
    budget_max:      body.budget_max || null,
    timeframe:       body.timeframe || null,
    temperature:     body.temperature || "warm",
    source:          body.source || "csv_import",
    status:          body.status || "new",
    created_at:      new Date().toISOString(),
    updated_at:      new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("contacts")
    .upsert(record, { onConflict: "email", ignoreDuplicates: false })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 });
}
