import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";
import { stripHtml } from "../../../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const SYSTEM = `You are an AI brief writer for a property advisor's CRM. The advisor (Sean, NextKey Property Strategists) opens a contact's page and needs to know in 5 seconds: who is this person, where are they in their journey, and what should I focus on with them.

Write a tight, factual brief in EXACTLY 3 lines:
1. Identity + situation: who they are and what they're looking for, including buyer type, budget if known, and preferred state. One sentence.
2. Status + signal: how engaged they are right now (recent activity, opportunities open, sentiment if discernible from notes/conversations). One sentence.
3. Next move: the single most useful thing the advisor could do for them right now. One sentence, action-oriented.

Rules: no preamble, no headers, no bullet markers, no quotation marks, no emoji. Use plain prose. If a field is unknown, omit it rather than saying "unknown." Treat the contact as the subject — don't address the advisor as "you."`;

export async function POST(req: Request) {
  try {
    const { contactId } = await req.json();
    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
    }

    // Fetch live contact (or fall back to GHL archive)
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

    // Resolve linked GHL archive id (explicit field or email match)
    let ghlContactId: string | null = contact.ghl_contact_id ?? null;
    if (!ghlContactId && contact.email) {
      const { data } = await supabase
        .from("ghl_archive_contacts")
        .select("id")
        .ilike("email", contact.email)
        .limit(1);
      ghlContactId = data?.[0]?.id ?? null;
    }

    // Pull recent activity in parallel — keep it bounded so the prompt stays small
    const [
      { data: notes },
      { data: conversations },
      { data: tasks },
      { data: opportunities },
    ] = await Promise.all([
      ghlContactId
        ? supabase
            .from("ghl_archive_notes")
            .select("body,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_conversations")
            .select("type,last_message_body,last_message_type,last_message_date")
            .eq("contact_id", ghlContactId)
            .order("last_message_date", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_tasks")
            .select("title,due_date,completed,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_opportunities")
            .select("name,status,monetary_value,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Build a compact context block
    const userPrompt = buildContactContext(contact, {
      notes: notes ?? [],
      conversations: conversations ?? [],
      tasks: tasks ?? [],
      opportunities: opportunities ?? [],
    });

    // Fingerprint: contact's updated_at + the latest timestamps on related data.
    // If any of these change, cache invalidates; otherwise the brief is reused.
    const fingerprintInput = {
      v: 1,
      updated_at: contact.updated_at ?? null,
      notes_latest: latestDate(notes, "date_added"),
      convo_latest: latestDate(conversations, "last_message_date"),
      tasks_latest: latestDate(tasks, "date_added"),
      opps_latest: latestDate(opportunities, "date_added"),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "contact-brief",
        refId: contactId,
        fingerprintInput,
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 1500,
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
      { ok: false, error: e?.message ?? "Failed to generate brief" },
      { status: 500 },
    );
  }
}

function buildContactContext(
  contact: any,
  extras: { notes: any[]; conversations: any[]; tasks: any[]; opportunities: any[] },
): string {
  const lines: string[] = [];
  lines.push("=== CONTACT ===");
  lines.push(`Name: ${contact.name || contact.full_name || "(unnamed)"}`);
  if (contact.email) lines.push(`Email: ${contact.email}`);
  if (contact.phone) lines.push(`Phone: ${contact.phone}`);
  if (contact.buyer_type) lines.push(`Buyer type: ${contact.buyer_type}`);
  if (contact.preferred_state || contact.state)
    lines.push(`State: ${contact.preferred_state || contact.state}`);
  const budget =
    contact.budget ||
    (contact.budget_min && contact.budget_max
      ? `${contact.budget_min}–${contact.budget_max}`
      : null);
  if (budget) lines.push(`Budget: ${budget}`);
  if (contact.finance_status) lines.push(`Finance: ${contact.finance_status}`);
  if (contact.timeframe) lines.push(`Timeframe: ${contact.timeframe}`);
  if (contact.temperature) lines.push(`Temperature: ${contact.temperature}`);
  if (contact.lead_score != null) lines.push(`Lead score: ${contact.lead_score}`);
  if (contact.status) lines.push(`Status: ${contact.status}`);
  if (contact.source) lines.push(`Source: ${contact.source}`);
  if (Array.isArray(contact.tags) && contact.tags.length > 0)
    lines.push(`Tags: ${contact.tags.join(", ")}`);
  if (contact.notes) lines.push(`Free-text notes: ${truncate(contact.notes, 500)}`);

  if (extras.opportunities.length > 0) {
    lines.push("\n=== OPPORTUNITIES ===");
    for (const o of extras.opportunities) {
      lines.push(`- ${o.name || "(untitled)"} · ${o.status || "?"} · ${fmtCurrency(o.monetary_value)} · ${fmtDate(o.date_added)}`);
    }
  }
  if (extras.conversations.length > 0) {
    lines.push("\n=== RECENT CONVERSATIONS ===");
    for (const c of extras.conversations) {
      lines.push(
        `- ${c.last_message_type || c.type || "?"} · ${fmtDate(c.last_message_date)}: ${truncate(stripHtml(c.last_message_body), 200)}`,
      );
    }
  }
  if (extras.notes.length > 0) {
    lines.push("\n=== RECENT NOTES ===");
    for (const n of extras.notes) {
      lines.push(`- ${fmtDate(n.date_added)}: ${truncate(stripHtml(n.body), 300)}`);
    }
  }
  if (extras.tasks.length > 0) {
    lines.push("\n=== TASKS ===");
    for (const t of extras.tasks) {
      const status = t.completed ? "done" : "open";
      lines.push(`- [${status}] ${t.title || "(untitled)"} · due ${fmtDate(t.due_date)}`);
    }
  }
  return lines.join("\n");
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
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString("en-AU", { year: "2-digit", month: "short", day: "numeric" });
}
function fmtCurrency(n: number | null | undefined) {
  if (n == null || !isFinite(n as number)) return "—";
  return `$${Number(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}
