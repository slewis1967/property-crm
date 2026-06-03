/**
 * PATCH  /api/mail/folders/{id}   { name?, color?, parent_id? }
 * DELETE /api/mail/folders/{id}
 *
 * System folders (system=true) are read-only. Both PATCH and DELETE refuse
 * with 409 on system rows so the UI can keep the same call pattern without
 * special-casing. Ownership is enforced — folders belonging to a different
 * user return 404 even though the row exists.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

async function loadFolder(id: string, owner: string) {
  const { data, error } = await supabase
    .from("email_folders")
    .select("id,name,parent_id,color,system,owner_user_email")
    .eq("id", id)
    .eq("owner_user_email", owner)
    .maybeSingle();
  if (error) return { ok: false as const, status: 500, error: error.message };
  if (!data) return { ok: false as const, status: 404, error: "Folder not found" };
  return { ok: true as const, folder: data };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = await userEmailFromRequest(req);
  const lookup = await loadFolder(id, owner);
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, error: lookup.error }, { status: lookup.status });
  }
  if (lookup.folder.system) {
    return NextResponse.json(
      { ok: false, error: "System folders are read-only" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 80);
  if (typeof body.color === "string") patch.color = body.color || null;
  if (body.parent_id !== undefined) patch.parent_id = body.parent_id;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_folders")
    .update(patch)
    .eq("id", id)
    .eq("owner_user_email", owner)
    .select("id,name,parent_id,color,system,created_at")
    .single();
  if (error) {
    const dup = error.code === "23505";
    return NextResponse.json(
      { ok: false, error: dup ? "A folder with that name already exists" : error.message },
      { status: dup ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true, folder: data });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = await userEmailFromRequest(req);
  const lookup = await loadFolder(id, owner);
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, error: lookup.error }, { status: lookup.status });
  }
  if (lookup.folder.system) {
    return NextResponse.json(
      { ok: false, error: "System folders can't be deleted" },
      { status: 409 },
    );
  }

  // Any emails currently filed in this folder fall back to inbox view
  // (folder_id=null). Done in a single UPDATE before the folder delete so
  // we never leave dangling references — the FK isn't set with ON DELETE
  // SET NULL because we want this behaviour to be explicit.
  await supabase
    .from("email_log")
    .update({ folder_id: null })
    .eq("folder_id", id)
    .eq("owner_user_email", owner);

  const { error } = await supabase
    .from("email_folders")
    .delete()
    .eq("id", id)
    .eq("owner_user_email", owner);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
