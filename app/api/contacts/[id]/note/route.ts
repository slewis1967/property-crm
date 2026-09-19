import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { formatDateTime } from "../../../../../utils/datetime";

/**
 * Append one dated note to a contact — used by the phone view (/m/contacts/[id]).
 *
 * The contact detail page saves `notes` as one whole text blob through PATCH
 * /api/contacts/[id]. That's fine from one screen, but a phone sending its own
 * copy of the blob would wipe anything written on the desktop since the phone
 * loaded the page. So this route reads the current notes and appends on the
 * server, in the same "[date · source]" form the voice assistant's log_call uses.
 */

const MAX_NOTE = 4000;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_NOTE) : "";
  if (!text) return NextResponse.json({ error: "Note is empty" }, { status: 400 });

  const { data: contact, error: readErr } = await supabase
    .from("contacts")
    .select("id,notes")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  const entry = `[${formatDateTime(new Date())} · phone note]\n${text}`;
  const notes = contact.notes ? `${contact.notes}\n\n${entry}` : entry;
  const { error: writeErr } = await supabase
    .from("contacts")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, notes });
}
