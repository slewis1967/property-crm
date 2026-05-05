import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: contactId } = await params;
  const body = await req.json();
  const allowed = [
    "notes", "status", "temperature", "tags", "buyer_type",
    // Identity
    "name", "full_name", "email", "phone",
    // Profile
    "preferred_state", "state", "budget_max", "budget", "timeframe",
    "lead_score", "segment", "source", "message",
  ];
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { error } = await supabase.from("contacts").update(update).eq("id", contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: contactId } = await params;
  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
