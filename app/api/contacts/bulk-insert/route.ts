import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

import { requireAuth } from "../../../../utils/cf-access";

type ContactInput = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  buyer_type?: string | null;
  preferred_state?: string | null;
  budget_max?: number | null;
  timeframe?: string | null;
  temperature?: string | null;
  source?: string | null;
  status?: string | null;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const contacts: ContactInput[] = body.contacts;
  const defaultTags: string[] = Array.isArray(body.default_tags) ? body.default_tags : [];
  const defaultSource: string | null =
    typeof body.default_source === "string" && body.default_source.trim()
      ? body.default_source.trim()
      : null;

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: "No contacts provided" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const toRecord = (b: ContactInput) => {
    const firstName = b.first_name?.trim() || "";
    const lastName = b.last_name?.trim() || "";
    const fullName =
      b.full_name?.trim() || [firstName, lastName].filter(Boolean).join(" ");
    return {
      full_name: fullName || null,
      name: fullName || null,
      first_name: firstName || null,
      email: b.email?.toLowerCase().trim() || null,
      phone: b.phone?.trim() || null,
      buyer_type: b.buyer_type || null,
      preferred_state: b.preferred_state || null,
      state: b.preferred_state || null,
      budget_max: b.budget_max || null,
      timeframe: b.timeframe || null,
      temperature: b.temperature || "warm",
      source: b.source || defaultSource || "csv_import",
      status: b.status || "new",
      created_at: now,
      updated_at: now,
    };
  };

  const withEmail = contacts
    .filter((c) => c.email?.includes("@"))
    .map(toRecord)
    .filter((r) => r.full_name);
  const withoutEmail = contacts
    .filter((c) => !c.email?.includes("@"))
    .map(toRecord)
    .filter((r) => r.full_name);

  let inserted = 0;
  const errors: string[] = [];
  const insertedEmails: string[] = [];
  const insertedNoEmailIds: string[] = [];

  if (withEmail.length) {
    const { error, data } = await supabase
      .from("contacts")
      .upsert(withEmail, { onConflict: "email", ignoreDuplicates: false })
      .select("id,email");
    if (error) errors.push(error.message);
    else {
      inserted += withEmail.length;
      for (const r of data ?? []) if (r.email) insertedEmails.push(r.email);
    }
  }

  if (withoutEmail.length) {
    const { error, data } = await supabase
      .from("contacts")
      .insert(withoutEmail)
      .select("id");
    if (error) errors.push(error.message);
    else {
      inserted += withoutEmail.length;
      for (const r of data ?? []) if (r.id) insertedNoEmailIds.push(r.id);
    }
  }

  // Apply default tags if provided. Done as a follow-up update because Supabase
  // upsert overwrites the tags column on conflict; we want every imported row
  // to carry the tag set regardless of whether it was new or already existed.
  if (defaultTags.length > 0) {
    if (insertedEmails.length > 0) {
      const { error } = await supabase
        .from("contacts")
        .update({ tags: defaultTags, updated_at: now })
        .in("email", insertedEmails);
      if (error) errors.push(`tag update (with-email): ${error.message}`);
    }
    if (insertedNoEmailIds.length > 0) {
      const { error } = await supabase
        .from("contacts")
        .update({ tags: defaultTags, updated_at: now })
        .in("id", insertedNoEmailIds);
      if (error) errors.push(`tag update (no-email): ${error.message}`);
    }
  }

  if (errors.length)
    return NextResponse.json({ error: errors.join("; ") }, { status: 500 });
  return NextResponse.json({ ok: true, inserted });
}
