import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export async function POST(req: NextRequest) {
  const { contacts } = await req.json();
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const toRecord = (body: any) => {
    const firstName = body.first_name?.trim() || "";
    const lastName  = body.last_name?.trim() || "";
    const fullName  = body.full_name?.trim() || [firstName, lastName].filter(Boolean).join(" ");
    return {
      full_name:       fullName || null,
      name:            fullName || null,
      first_name:      firstName || null,
      email:           body.email?.toLowerCase().trim() || null,
      phone:           body.phone?.trim() || null,
      buyer_type:      body.buyer_type || null,
      preferred_state: body.preferred_state || null,
      state:           body.preferred_state || null,
      budget_max:      body.budget_max || null,
      timeframe:       body.timeframe || null,
      temperature:     body.temperature || "warm",
      source:          body.source || "csv_import",
      status:          body.status || "new",
      created_at:      now,
      updated_at:      now,
    };
  };

  const withEmail    = contacts.filter(c => c.email?.includes("@")).map(toRecord).filter(r => r.full_name);
  const withoutEmail = contacts.filter(c => !c.email?.includes("@")).map(toRecord).filter(r => r.full_name);

  let inserted = 0;
  const errors: string[] = [];

  if (withEmail.length) {
    const { error } = await supabase
      .from("contacts")
      .upsert(withEmail, { onConflict: "email", ignoreDuplicates: false });
    if (error) errors.push(error.message);
    else inserted += withEmail.length;
  }

  if (withoutEmail.length) {
    const { error } = await supabase
      .from("contacts")
      .insert(withoutEmail);
    if (error) errors.push(error.message);
    else inserted += withoutEmail.length;
  }

  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  return NextResponse.json({ ok: true, inserted });
}
