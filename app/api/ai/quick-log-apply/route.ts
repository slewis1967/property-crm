/**
 * Persist a Quick Log AI extraction.
 *
 * Body shape:
 *   {
 *     contactId: string,
 *     payload: <the AI extraction object: summary, tasks, tags, temperature,
 *               status_change, follow_up_in_days>,
 *     applied: {
 *       summary?: boolean,         // append cleaned summary to contacts.notes
 *       taskIndexes?: number[],    // indexes into payload.tasks to actually insert
 *       tags?: boolean,            // merge payload.tags into contacts.tags
 *       temperature?: boolean,     // set contacts.temperature
 *       status?: boolean,          // set contacts.status (from payload.status_change)
 *       followUp?: boolean,        // create a follow-up task N days out
 *     }
 *   }
 *
 * Returns: { ok: true, applied: { taskCount, tagsAdded, ... } }
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

type Task = { title: string; due_date: string | null };
type Payload = {
  summary?: string;
  tasks?: Task[];
  tags?: string[];
  status_change?: string | null;
  temperature?: string | null;
  follow_up_in_days?: number | null;
};

type Applied = {
  summary?: boolean;
  taskIndexes?: number[];
  tags?: boolean;
  temperature?: boolean;
  status?: boolean;
  followUp?: boolean;
};

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const contactId: string | undefined = body.contactId;
    const payload: Payload = body.payload ?? {};
    const applied: Applied = body.applied ?? {};

    if (!contactId) {
      return NextResponse.json({ ok: false, error: "contactId required" }, { status: 400 });
    }

    const { data: contact, error: contactErr } = await supabase
      .from("contacts")
      .select("id,notes,tags,temperature,status")
      .eq("id", contactId)
      .maybeSingle();
    if (contactErr || !contact) {
      return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const summary: Record<string, any> = {
      taskCount: 0,
      tagsAdded: 0,
      summarySaved: false,
      temperatureSet: false,
      statusSet: false,
      followUpCreated: false,
    };
    const errors: string[] = [];

    // 1. Tasks (selective by index)
    if (Array.isArray(applied.taskIndexes) && applied.taskIndexes.length > 0 && payload.tasks) {
      const rows = applied.taskIndexes
        .map((i) => payload.tasks![i])
        .filter((t): t is Task => !!t && !!t.title)
        .map((t) => ({
          contact_id: contactId,
          title: t.title,
          due_date: parseDueDate(t.due_date),
          source: "quick-log",
          created_at: now,
          updated_at: now,
        }));
      if (rows.length > 0) {
        const { error } = await supabase.from("tasks").insert(rows);
        if (error) errors.push(`tasks: ${error.message}`);
        else summary.taskCount = rows.length;
      }
    }

    // 2. Follow-up task (separate from extracted tasks)
    if (applied.followUp && payload.follow_up_in_days && payload.follow_up_in_days > 0) {
      const due = new Date(Date.now() + payload.follow_up_in_days * 86400_000).toISOString();
      const { error } = await supabase.from("tasks").insert({
        contact_id: contactId,
        title: `Follow up — Quick Log on ${now.slice(0, 10)}`,
        due_date: due,
        source: "quick-log",
        created_at: now,
        updated_at: now,
      });
      if (error) errors.push(`follow-up task: ${error.message}`);
      else summary.followUpCreated = true;
    }

    // Build the contacts UPDATE payload
    const update: Record<string, any> = {};

    // 3. Tags (merge with existing, dedup, lowercase)
    if (applied.tags && Array.isArray(payload.tags) && payload.tags.length > 0) {
      const existing = Array.isArray(contact.tags) ? (contact.tags as string[]) : [];
      const incoming = payload.tags
        .map((t) => String(t).trim().toLowerCase())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...incoming]));
      if (merged.length !== existing.length) {
        update.tags = merged;
        summary.tagsAdded = merged.length - existing.length;
      }
    }

    // 4. Temperature
    if (applied.temperature && payload.temperature) {
      const t = String(payload.temperature).toLowerCase();
      if (["hot", "warm", "cold"].includes(t)) {
        update.temperature = t;
        summary.temperatureSet = true;
      }
    }

    // 5. Status
    if (applied.status && payload.status_change) {
      update.status = payload.status_change;
      summary.statusSet = true;
    }

    // 6. Summary → append to contacts.notes
    if (applied.summary && payload.summary) {
      const stamp = now.slice(0, 16).replace("T", " ");
      const block = `[${stamp}] ${payload.summary.trim()}`;
      const existingNotes = (contact.notes as string | null) || "";
      update.notes = existingNotes ? `${existingNotes}\n\n${block}` : block;
      summary.summarySaved = true;
    }

    if (Object.keys(update).length > 0) {
      update.updated_at = now;
      const { error } = await supabase.from("contacts").update(update).eq("id", contactId);
      if (error) errors.push(`contact update: ${error.message}`);
    }

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, error: errors.join("; "), applied: summary }, { status: 500 });
    }
    return NextResponse.json({ ok: true, applied: summary });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to apply quick log" },
      { status: 500 },
    );
  }
}

/** Best-effort parse — accepts ISO date, datetime, or natural language fallback to null. */
function parseDueDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.valueOf())) return null;
  return d.toISOString();
}
