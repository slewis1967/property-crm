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
    "name", "first_name", "full_name", "email", "phone",
    // Profile
    "preferred_state", "state",
    "budget", "budget_min", "budget_max",
    "finance_status", "timeframe",
    "lead_score", "segment", "source", "message",
    // Personal
    "date_of_birth", "marital_status", "dependents_count",
    // Home address
    "home_address_street", "home_address_suburb",
    "home_address_state", "home_address_postcode",
    // Employment
    "employment_type", "employer_name", "occupation",
    // Financial — feeds borrowing calculator
    "annual_income", "partner_annual_income",
    "existing_savings", "hecs_balance",
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
