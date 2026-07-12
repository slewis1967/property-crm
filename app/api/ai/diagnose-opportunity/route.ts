import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { nexusApi } from "../../../../utils/nexus-api";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";
import { stripHtml } from "../../../../utils/archive-helpers";

import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { errMessage } from "../../../../utils/errors";
export const dynamic = "force-dynamic";

interface LeadRow {
  id?: string | null;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  state?: string | null;
  buyer_type?: string | null;
  temperature?: string | null;
  score?: number | null;
  stage?: string | null;
  match_status?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  error?: unknown;
  _archive?: boolean;
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
interface TaskRow {
  title: string | null;
  due_date: string | null;
  completed: boolean | null;
  date_added: string | null;
}

const SYSTEM = `You diagnose stuck opportunities in a property advisor's pipeline. Sean opens an opportunity and wants to know: is it stuck, and if so, why, and what should I do?

Output STRICT JSON only — no preamble, no markdown fences. Format:
{
  "stuck": true|false,
  "diagnosis": "<one-sentence explanation of the situation, anchored in specific facts>",
  "unblock": "<one-sentence concrete next action, or empty string if not stuck>"
}

Rules:
- Stuck means meaningful: more than 7 days since last activity, blocked by missing info (finance, location), waiting on a tool/document, or contact has gone cold. Don't say stuck just because it's recent and idle.
- Diagnosis must reference a real fact from the input (a date, a status, a missing field, a no-reply count) — not generic.
- "unblock" is a single concrete action, not "follow up" — be specific (call, send X, request finance pre-approval, etc.).
- If the opp is fresh and progressing fine, set stuck=false and put a short positive read in diagnosis (e.g., "Active, last contacted 2 days ago — no intervention needed yet"). Leave unblock as "".`;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { opportunityId } = await req.json();
    if (!opportunityId) {
      return NextResponse.json({ ok: false, error: "opportunityId required" }, { status: 400 });
    }

    // Fetch the lead from NEXUS API
    let lead: LeadRow | null = null;
    try {
      const res = await nexusApi(`/api/leads/${opportunityId}`, { cache: "no-store" });
      if (res.ok) lead = await res.json();
    } catch (e) {
      log.warn("diagnose.nexus_lead_fetch_failed", { opportunityId, ...errInfo(e) });
    }

    if (!lead || lead.error) {
      // Fall back to GHL archive opportunity
      const { data: archiveOpp } = await supabase
        .from("ghl_archive_opportunities")
        .select("*")
        .eq("id", opportunityId)
        .maybeSingle();
      if (!archiveOpp) {
        return NextResponse.json({ ok: false, error: "Opportunity not found" }, { status: 404 });
      }
      lead = {
        id: archiveOpp.id,
        full_name: archiveOpp.name,
        status: archiveOpp.status,
        match_status: null,
        score: null,
        stage: null,
        created_at: archiveOpp.date_added,
        updated_at: archiveOpp.date_updated,
        email: null,
        _archive: true,
      };
    }

    // Pull related context from GHL archive (matched on email)
    let ghlContactId: string | null = null;
    if (lead.email) {
      const { data } = await supabase
        .from("ghl_archive_contacts")
        .select("id")
        .ilike("email", lead.email)
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
            .from("ghl_archive_tasks")
            .select("title,due_date,completed,date_added")
            .eq("contact_id", ghlContactId)
            .order("date_added", { ascending: false, nullsFirst: false })
            .limit(5)
        : Promise.resolve({ data: [] as TaskRow[] }),
    ]);

    const userPrompt = [
      "OPPORTUNITY:",
      `name: ${lead.full_name || lead.name || "(unnamed)"}`,
      `email: ${lead.email || "—"}`,
      `state: ${lead.state || "—"}`,
      `buyer type: ${lead.buyer_type || "—"}`,
      `temperature: ${lead.temperature || "—"} · score: ${lead.score ?? "—"}`,
      `stage: ${lead.stage || lead.match_status || "—"}`,
      `status: ${lead.status || "—"}`,
      `created: ${lead.created_at || "—"}`,
      `last updated: ${lead.updated_at || "—"}`,
      lead.notes ? `notes: ${truncate(lead.notes, 300)}` : "",
      "",
      `now: ${new Date().toISOString()}`,
      "",
      ...((notes?.length ?? 0) > 0
        ? [
            "RECENT NOTES:",
            ...(notes ?? []).map((n: NoteRow) => `- ${n.date_added}: ${truncate(stripHtml(n.body), 300)}`),
            "",
          ]
        : []),
      ...((conversations?.length ?? 0) > 0
        ? [
            "RECENT CONVERSATIONS:",
            ...(conversations ?? []).map(
              (c: ConversationRow) =>
                `- ${c.last_message_type || c.type} · ${c.last_message_date}: ${truncate(stripHtml(c.last_message_body), 200)}`,
            ),
            "",
          ]
        : []),
      ...((tasks?.length ?? 0) > 0
        ? [
            "TASKS:",
            ...(tasks ?? []).map(
              (t: TaskRow) =>
                `- [${t.completed ? "done" : "open"}] ${t.title || "?"} · due ${t.due_date} · added ${t.date_added}`,
            ),
          ]
        : []),
    ]
      .filter((s) => s !== "")
      .join("\n");

    const fingerprintInput = {
      v: 1,
      lead_updated: lead.updated_at ?? null,
      stage: lead.stage ?? lead.match_status ?? null,
      notes_latest: latestDate(notes, "date_added"),
      convo_latest: latestDate(conversations, "last_message_date"),
      tasks_latest: latestDate(tasks, "date_added"),
      day_bucket: new Date().toISOString().slice(0, 10), // re-evaluate at most daily even if data unchanged
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "diagnose-opportunity",
        refId: opportunityId,
        fingerprintInput,
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 1500,
            effort: "medium",
          }),
      });
      const parsed = parseDiagnosis(result.text);
      return NextResponse.json({ ok: true, diagnosis: parsed, cached: result.cached });
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: errMessage(e, "AI request failed") },
        { status: 500 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: errMessage(e, "Failed to diagnose") },
      { status: 500 },
    );
  }
}

function parseDiagnosis(
  text: string,
): { stuck: boolean; diagnosis: string; unblock: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    return {
      stuck: !!obj.stuck,
      diagnosis: typeof obj.diagnosis === "string" ? obj.diagnosis : "",
      unblock: typeof obj.unblock === "string" ? obj.unblock : "",
    };
  } catch {
    return null;
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
