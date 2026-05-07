import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export async function GET() {
  // Pull personal/employment/financial fields too so when a user picks a
  // contact from the New Opportunity modal, those values flow straight
  // into the new lead row without any extra round-trip.
  const { data, error } = await supabase
    .from("contacts")
    .select(`id,name,full_name,email,phone,buyer_type,preferred_state,budget_max,
             date_of_birth,marital_status,dependents_count,
             home_address_street,home_address_suburb,home_address_state,home_address_postcode,
             employment_type,employer_name,occupation,
             annual_income,partner_annual_income,existing_savings,hecs_balance`)
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data || [] });
}
