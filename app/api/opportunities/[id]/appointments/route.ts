import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

/**
 * Cal.com appointments matching this opportunity's lead email. The lead
 * record itself lives in DuckDB (NEXUS API), so the client passes the
 * email as a query param rather than us looking it up here. Empty string
 * is a no-op — return [] without hitting Supabase.
 */
export async function GET(
  req: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> }
) {
  await _params; // satisfy the type; we don't actually need the lead id, just email
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ appointments: [] });

  const { data, error } = await supabase
    .from("appointments")
    .select("id,cal_uid,event_title,start_time,end_time,location,status,host_name")
    .eq("contact_email", email)
    .order("start_time", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ appointments: [], error: error.message }, { status: 500 });
  return NextResponse.json({ appointments: data ?? [] });
}
