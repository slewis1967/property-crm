import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("contacts")
    .select("id,name,full_name,email,phone,buyer_type,preferred_state,budget_max")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data || [] });
}
