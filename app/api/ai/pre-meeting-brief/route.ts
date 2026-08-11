import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";
import { stripHtml } from "../../../../utils/archive-helpers";

import { requireAuth } from "../../../../utils/cf-access";
import { errMessage } from "../../../../utils/errors";
import { BUSINESS_TIME_ZONE, formatLongDateTime } from "../../../../utils/datetime";
export const dynamic = "force-dynamic";

interface ContactRow {
  id?: string | null;
  ghl_contact_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  name?: string | null;
  buyer_type?: string | null;
  preferred_state?: string | null;
  budget_max?: string | number | null;
  budget?: string | number | null;
  finance_status?: string | null;
  timeframe?: string | null;
  temperature?: string | null;
  lead_score?: number | null;
  notes?: string | null;
  updated_at?: string | null;
}
interface NoteRow {
  body: string | null;
  date_added: string | null;
}
interface ConversationRow {
  type: string | null;
  last_message_body: string | null;
  last_message_type: string | null;
  last_message_date: string | null;
}
interface OpportunityRow {
  name: string | null;
  status: string | null;
  monetary_value: number | null;
  date_added: string | null;
}

const SYSTEM = `You write a 60-second pre-meeting brief for a property advisor.

Sean has a Cal.com appointment coming up. Read the contact's history and produce a brief that helps him walk in confident, knowing exactly what to bring up.

Format STRICTLY:
**Who they are:** <one sentence — name, buyer profile, situation>
**Where we left off:** <one sentence — last meaningful interaction, sentiment if discernible>
**Bring up:** <2-3 short bullets, each one specific topic to raise — pending questions, properties to share, decisions to confirm>
**Don't bring up:** <0-1 bullets if there's something to AVOID — sensitive topic, dead lead from a competitor, etc. Skip this section if nothing to flag>

Plain text, no markdown beyond ** for bold labels and • for bullets. Keep the whole brief under 150 words. No preamble.`;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { appointmentId } = await req.json();
    if (!appointmentId) {
      return NextResponse.json({ ok: false, error: "appointmentId required" }, { status: 400 });
    }

    const { data: appt } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appt) {
      return NextResponse.json({ ok: false, error: "Appointment not found" }, { status: 404 });
    }

    // Resolve associated contact (live first, archive fallback by email)
    let contact: ContactRow | null = null;
    if (appt.contact_id) {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", appt.contact_id)
        .maybeSingle();
      contact = data;
    }
    if (!contact && appt.contact_email) {
      const { data } = await supabase
        .from("contacts")
        .select("*")
        .ilike("email", appt.contact_email)
        .limit(1);
      contact = data?.[0] ?? null;
    }

    let ghlContactId: string | null = null;
    if (contact?.ghl_contact_id) {
      ghlContactId = contact.ghl_contact_id;
    } else {
      const lookupEmail = (contact?.email as string | undefined) || appt.contact_email;
      if (lookupEmail) {
        const { data: archives } = await supabase
          .from("ghl_archive_contacts")
          .select("id")
          .ilike("email", lookupEmail)
          .limit(1);
        ghlContactId = archives?.[0]?.id ?? null;
      }
    }

    const [{ data: notes }, { data: conversations }, { data: opportunities }] = await Promise.all([
      ghlContactId
        ? supabase
            .from("ghl_archive_notes")
            .select("body,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as NoteRow[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_conversations")
            .select("type,last_message_body,last_message_type,last_message_date")
            .eq("contact_id", ghlContactId)
            .order("last_message_date", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as ConversationRow[] }),
      ghlContactId
        ? supabase
            .from("ghl_archive_opportunities")
            .select("name,status,monetary_value,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(3)
        : Promise.resolve({ data: [] as OpportunityRow[] }),
    ]);

    const userPrompt = [
      "APPOINTMENT:",
      `event: ${appt.event_title || "(untitled)"}`,
      `when: ${appt.start_time ? `${formatLongDateTime(appt.start_time)} (${BUSINESS_TIME_ZONE})` : "?"}`,
      `host: ${appt.host_name || appt.host_email || "?"}`,
      `location: ${appt.location || "—"}`,
      appt.additional_notes ? `notes from booking form: ${truncate(appt.additional_notes, 400)}` : "",
      "",
      "CONTACT:",
      `name: ${contact?.full_name || contact?.name || appt.contact_name || "(unknown)"}`,
      `email: ${contact?.email || appt.contact_email || "—"}`,
      contact?.buyer_type ? `buyer type: ${contact.buyer_type}` : "",
      contact?.preferred_state ? `state: ${contact.preferred_state}` : "",
      (contact?.budget_max || contact?.budget) ? `budget: ${contact.budget_max || contact.budget}` : "",
      contact?.finance_status ? `finance: ${contact.finance_status}` : "",
      contact?.timeframe ? `timeframe: ${contact.timeframe}` : "",
      contact?.temperature ? `temperature: ${contact.temperature}` : "",
      contact?.lead_score != null ? `score: ${contact.lead_score}` : "",
      contact?.notes ? `internal notes: ${truncate(contact.notes, 300)}` : "",
      "",
      ...((opportunities?.length ?? 0) > 0
        ? [
            "OPEN/RECENT OPPORTUNITIES:",
            ...(opportunities ?? []).map(
              (o: OpportunityRow) =>
                `- ${o.name || "?"} · ${o.status || "?"} · ${o.monetary_value ? `$${Number(o.monetary_value).toLocaleString()}` : "?"} (${o.date_added})`,
            ),
            "",
          ]
        : []),
      ...((conversations?.length ?? 0) > 0
        ? [
            "RECENT CONVERSATIONS:",
            ...(conversations ?? []).map(
              (c: ConversationRow) =>
                `- ${c.last_message_type || c.type} ${c.last_message_date}: ${truncate(stripHtml(c.last_message_body), 250)}`,
            ),
            "",
          ]
        : []),
      ...((notes?.length ?? 0) > 0
        ? [
            "RECENT NOTES:",
            ...(notes ?? []).map(
              (n: NoteRow) => `- ${n.date_added}: ${truncate(stripHtml(n.body), 300)}`,
            ),
          ]
        : []),
    ]
      .filter((s) => s !== "")
      .join("\n");

    const fingerprintInput = {
      v: 1,
      appt_status: appt.status,
      contact_id: contact?.id ?? null,
      contact_updated: contact?.updated_at ?? null,
      notes_latest: latestDate(notes, "date_added"),
      convo_latest: latestDate(conversations, "last_message_date"),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "pre-meeting-brief",
        refId: appointmentId,
        fingerprintInput,
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 2000,
            effort: "medium",
          }),
      });
      return NextResponse.json({ ok: true, text: result.text, cached: result.cached });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: errMessage(e, "AI request failed") },
        { status: 500 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: errMessage(e, "Failed to build pre-meeting brief") },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function latestDate(rows: readonly unknown[] | null | undefined, field: string): string | null {
  if (!rows || rows.length === 0) return null;
  let max: string | null = null;
  for (const r of rows) {
    const v = (r as Record<string, unknown>)?.[field];
    if (v && (!max || (v as string) > max)) max = v as string;
  }
  return max;
}
