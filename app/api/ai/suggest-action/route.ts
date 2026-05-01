import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";
import { stripHtml } from "../../../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const SYSTEM = `You are a property advisor's coach. Look at one contact and suggest the SINGLE most leveraged next action the advisor (Sean) could take with them today.

Output format (strict): a single line, plain text, no preamble. Pattern:
"<verb> <object> — <one-clause rationale>"

Examples:
"Send the Springfield Lakes stocklist — they're FHB QLD and we have 4 fresh matches"
"Call them today — hot lead, no contact in 11 days, contract closes Friday"
"Confirm finance pre-approval before next meeting — they're booked Tuesday but finance status is unknown"

Rules: be concrete (name a property/document/topic when possible), respect what's already happened (don't suggest something they just did), bias to low-friction actions, and keep it under 25 words.`;

export async function POST(req: Request) {
  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
    }

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

    const [{ data: notes }, { data: conversations }, { data: tasks }] = await Promise.all([
      ghlContactId
        ? supabase
            .from("ghl_archive_notes")
            .select("body,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_conversations")
            .select("type,last_message_body,last_message_type,last_message_date")
            .eq("contact_id", ghlContactId)
            .order("last_message_date", { ascending: false, nullsFirst: false })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_tasks")
            .select("title,due_date,completed,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(3)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const lines: string[] = [];
    lines.push(`Name: ${contact.name || contact.full_name || "(unnamed)"}`);
    if (contact.email) lines.push(`Email: ${contact.email}`);
    if (contact.buyer_type) lines.push(`Buyer type: ${contact.buyer_type}`);
    if (contact.preferred_state || contact.state)
      lines.push(`State: ${contact.preferred_state || contact.state}`);
    if (contact.budget) lines.push(`Budget: ${contact.budget}`);
    if (contact.finance_status) lines.push(`Finance: ${contact.finance_status}`);
    if (contact.timeframe) lines.push(`Timeframe: ${contact.timeframe}`);
    if (contact.temperature) lines.push(`Temperature: ${contact.temperature}`);
    if (contact.lead_score != null) lines.push(`Lead score: ${contact.lead_score}`);
    if (contact.status) lines.push(`Status: ${contact.status}`);
    if (contact.updated_at) lines.push(`Last updated: ${contact.updated_at}`);
    if ((notes ?? []).length > 0) {
      lines.push("\nRecent notes:");
      for (const n of notes!) lines.push(`- ${truncate(stripHtml(n.body), 200)} (${n.date_added})`);
    }
    if ((conversations ?? []).length > 0) {
      lines.push("\nRecent conversations:");
      for (const c of conversations!)
        lines.push(
          `- ${c.last_message_type || c.type}: ${truncate(stripHtml(c.last_message_body), 150)} (${c.last_message_date})`,
        );
    }
    if ((tasks ?? []).length > 0) {
      lines.push("\nTasks:");
      for (const t of tasks!)
        lines.push(`- [${t.completed ? "done" : "open"}] ${t.title || "?"} due ${t.due_date}`);
    }

    const fingerprintInput = {
      v: 1,
      updated_at: contact.updated_at ?? null,
      notes_latest: latestDate(notes, "date_added"),
      convo_latest: latestDate(conversations, "last_message_date"),
      tasks_latest: latestDate(tasks, "date_added"),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "suggest-action",
        refId: contactId,
        fingerprintInput,
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: lines.join("\n"),
            maxTokens: 1000,
            effort: "medium",
          }),
      });
      return NextResponse.json({ ok: true, text: result.text, cached: result.cached });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message ?? "AI request failed" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to suggest action" },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function latestDate(rows: any[] | null | undefined, field: string): string | null {
  if (!rows || rows.length === 0) return null;
  let max: string | null = null;
  for (const r of rows) {
    const v = r?.[field];
    if (v && (!max || v > max)) max = v;
  }
  return max;
}
