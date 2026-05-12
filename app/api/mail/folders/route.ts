/**
 * GET  /api/mail/folders                  list folders for the current CF Access user
 * POST /api/mail/folders { name, parent_id?, color? }   create a user folder
 *
 * System folders (Inbox, Sent, Drafts, Archive, Trash, Spam) are seeded
 * by the Phase 1 migration and returned alongside user-created folders.
 * User folders have system=false and can be renamed/deleted; system rows
 * refuse those operations in the [id] route.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const owner = userEmailFromRequest(req);
  const { data, error } = await supabase
    .from("email_folders")
    .select("id,name,parent_id,color,system,created_at")
    .eq("owner_user_email", owner)
    // System folders first (Inbox, Sent, …), then user folders alphabetically.
    // The Phase 1 seed runs system=TRUE; user-created get FALSE by default.
    .order("system", { ascending: false })
    .order("name", { ascending: true });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, folders: data ?? [] });
}

export async function POST(req: Request) {
  const owner = userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const { name, parent_id, color } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }
  const trimmed = name.trim().slice(0, 80);

  const { data, error } = await supabase
    .from("email_folders")
    .insert({
      owner_user_email: owner,
      name: trimmed,
      parent_id: parent_id ?? null,
      color: color ?? null,
      system: false,
    })
    .select("id,name,parent_id,color,system,created_at")
    .single();

  if (error) {
    // 23505 = unique violation — surface a friendlier message for duplicate folder names
    const dup = error.code === "23505";
    return NextResponse.json(
      { ok: false, error: dup ? "A folder with that name already exists" : error.message },
      { status: dup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, folder: data });
}
