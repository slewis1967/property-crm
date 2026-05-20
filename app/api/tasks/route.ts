import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";

/**
 * Create a task — used by NewOpportunityModal's "+ Schedule task" option
 * (and available to any other CRM-side caller that wants to insert a
 * task without going through the voice tool).
 *
 * Mirrors the insert shape used by createTask() in
 * app/api/voice/converse/route.ts so the rows look identical regardless
 * of origin — same columns, only the `source` tag differs ("voice" vs
 * "crm_modal" here) so reporting can distinguish entry paths.
 */

type Body = {
  title: string;
  contact_id?: string;
  due_date?: string | null; // ISO date "YYYY-MM-DD" or full ISO datetime
  source?: string;          // optional override; defaults to "crm_modal"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.contact_id && !UUID_RE.test(body.contact_id)) {
    return NextResponse.json({ error: "contact_id must be a UUID" }, { status: 400 });
  }
  if (body.due_date) {
    const ms = Date.parse(body.due_date);
    if (!Number.isFinite(ms)) {
      return NextResponse.json({ error: "due_date must be a valid ISO date" }, { status: 400 });
    }
  }

  const row: Record<string, unknown> = {
    title: title.slice(0, MAX_TITLE),
    source: body.source?.trim() || "crm_modal",
  };
  if (body.contact_id) row.contact_id = body.contact_id;
  if (body.due_date) row.due_date = body.due_date;

  // NB: this table uses created_at, NOT date_added — that's the GHL archive
  // convention from ghl_archive_tasks. A handful of older AI routes still
  // SELECT date_added from tasks; they were silently returning no rows.
  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id,title,due_date,contact_id,source,completed,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ task: data });
}
