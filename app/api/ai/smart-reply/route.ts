import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCallEnvelope } from "../../../../utils/ai";
import { stripHtml } from "../../../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const SYSTEM = `You are drafting a reply on Sean's behalf. Sean is a property advisor at NextKey Property Strategists. He needs a reply he can send with one tap (or edit lightly first).

Match the channel:
- "email" → 2-4 short paragraphs, Australian-English greeting + sign-off ("Hi [first name],"  …  "Cheers, Sean"). No corporate fluff.
- "sms" → 1-3 sentences, no greeting, no sign-off, mobile-natural.

Voice rules:
- Friendly and direct. Sean writes like a knowledgeable mate, not a salesperson.
- Match the contact's tone if it can be inferred from the thread (formal contacts get formal; casual contacts get casual).
- If the contact asked a question, answer it. If they raised an objection, address it directly.
- Reference specific facts from the thread (a property they mentioned, a date, a number) — don't write generic-sounding text.
- Never invent facts you don't have (no fake numbers, fake addresses, fake dates).
- If you don't have enough context to answer well, say so plainly and propose a quick call to clarify.

Output: just the reply body, ready to send. No preamble, no "Here's a draft:", no explanation.`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      contactId,
      channel = "email",
      direction,
    }: { contactId?: string; channel?: "email" | "sms"; direction?: string } = body;

    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
    }
    if (channel !== "email" && channel !== "sms") {
      return NextResponse.json({ ok: false, error: "channel must be email or sms" }, { status: 400 });
    }

    // Resolve contact
    let contact: any;
    const { data: liveContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    if (liveContact) {
      contact = liveContact;
    } else {
      const { data: archive } = await supabase
        .from("ghl_archive_contacts")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (!archive) {
        return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
      }
      contact = {
        ...archive,
        name:
          archive.contact_name ||
          `${archive.first_name || ""} ${archive.last_name || ""}`.trim() ||
          null,
      };
    }

    let ghlContactId: string | null = contact.ghl_contact_id ?? null;
    if (!ghlContactId && contact.email) {
      const { data } = await supabase
        .from("ghl_archive_contacts")
        .select("id")
        .ilike("email", contact.email)
        .limit(1);
      ghlContactId = data?.[0]?.id ?? null;
    }

    // Last 6 conversations + last 3 notes for tone + facts
    const [{ data: conversations }, { data: notes }] = await Promise.all([
      ghlContactId
        ? supabase
            .from("ghl_archive_conversations")
            .select("type,last_message_body,last_message_type,last_message_date")
            .eq("contact_id", ghlContactId)
            .order("last_message_date", { ascending: false, nullsFirst: false })
            .limit(6)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_notes")
            .select("body,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const firstName =
      contact.first_name ||
      (contact.name ? String(contact.name).split(/\s+/)[0] : null) ||
      "there";

    const lines: string[] = [];
    lines.push(`CHANNEL: ${channel}`);
    lines.push(`CONTACT FIRST NAME: ${firstName}`);
    if (contact.buyer_type) lines.push(`BUYER TYPE: ${contact.buyer_type}`);
    if (contact.preferred_state || contact.state)
      lines.push(`STATE: ${contact.preferred_state || contact.state}`);
    if (contact.budget) lines.push(`BUDGET: ${contact.budget}`);
    if (contact.finance_status) lines.push(`FINANCE: ${contact.finance_status}`);
    if (contact.timeframe) lines.push(`TIMEFRAME: ${contact.timeframe}`);
    if (direction) lines.push(`\nWHAT TO SAY (advisor's instruction): ${direction}`);
    if ((conversations ?? []).length > 0) {
      lines.push("\nRECENT THREAD (most recent first):");
      for (const c of conversations!) {
        lines.push(
          `[${c.last_message_type || c.type} · ${c.last_message_date}] ${truncate(stripHtml(c.last_message_body), 600)}`,
        );
      }
    }
    if ((notes ?? []).length > 0) {
      lines.push("\nINTERNAL NOTES (advisor's own notes — don't quote verbatim):");
      for (const n of notes!) lines.push(`- ${truncate(stripHtml(n.body), 400)}`);
    }

    const result = await aiCallEnvelope({
      system: SYSTEM,
      user: lines.join("\n"),
      maxTokens: 3000,
      effort: "high",
    });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to draft reply" },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
