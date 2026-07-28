import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";

/**
 * Update a live task — used by the Tasks panels (opportunity page + War Room)
 * to tick a task complete/incomplete, and to edit its title/due date.
 * Operates on the `tasks` table (live advisor TODOs), NOT ghl_archive_tasks.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 200;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a UUID" }, { status: 400 });
  }

  let body: { completed?: boolean; title?: string; due_date?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.completed === "boolean") patch.completed = body.completed;
  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim().slice(0, MAX_TITLE);
  }
  if ("due_date" in body) {
    if (body.due_date) {
      if (!Number.isFinite(Date.parse(body.due_date))) {
        return NextResponse.json({ error: "due_date must be a valid ISO date" }, { status: 400 });
      }
      patch.due_date = body.due_date;
    } else {
      patch.due_date = null;
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", id)
    .select("id,title,due_date,completed,contact_id,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ task: data });
}

/**
 * Delete a live task outright — the "I typed this by mistake" / "no longer
 * relevant" case that completing it doesn't cover.
 *
 * Deliberately NOT behind the deletion_log gate (utils/deletion-log.ts). That
 * exists because deleting a CLIENT or an OPPORTUNITY destroys a business record
 * and needs a written reason plus a name against it. A task is one person's
 * TODO; demanding a justification to clear a mistyped reminder would train
 * people to route around the gate everywhere it does matter.
 *
 * Returns 404 rather than a silent 200 when nothing matched, so the UI can tell
 * "already gone" from "deleted".
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a UUID" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: data.id });
}
