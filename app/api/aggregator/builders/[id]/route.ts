import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = [
  "canonical_name", "aliases", "sender_domains",
  "contact_email", "contact_phone", "active", "draft",
  "auto_outreach_enabled", "outreach_paused_until",
];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const update: Record<string, any> = {};
  for (const f of ALLOWED_FIELDS) {
    if (f in body) update[f] = body[f];
  }
  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("builders")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, builder: data });
}
