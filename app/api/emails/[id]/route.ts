/**
 * GET   /api/emails/{id}   fetch a single email row (full body_html for viewing)
 * PATCH /api/emails/{id}   mutate state — read/star/archive/trash/spam, folder, labels
 *
 * The PATCH endpoint accepts the same shape as the bulk route's `patch`
 * field so client code can use one mental model. Ownership is enforced;
 * the row 404s for non-owners regardless of CF Access status.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

const ALLOWED_BOOLS = [
  "is_read", "is_starred", "is_archived", "is_trashed", "is_spam",
] as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("email_log")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, email: data });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));

  const writePatch: Record<string, unknown> = {};
  for (const k of ALLOWED_BOOLS) {
    if (typeof body[k] === "boolean") writePatch[k] = body[k];
  }
  if ("folder_id" in body) writePatch.folder_id = body.folder_id ?? null;
  if (Array.isArray(body.labels)) writePatch.labels = body.labels;

  // add_labels/remove_labels operate on the existing array — read-modify-write.
  const addLabels    = Array.isArray(body.add_labels)    ? (body.add_labels    as string[]) : [];
  const removeLabels = Array.isArray(body.remove_labels) ? (body.remove_labels as string[]) : [];
  if (addLabels.length > 0 || removeLabels.length > 0) {
    const { data: row, error: readErr } = await supabase
      .from("email_log")
      .select("labels")
      .eq("id", id)
      .eq("owner_user_email", owner)
      .maybeSingle();
    if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok: false, error: "Email not found" }, { status: 404 });
    const set = new Set<string>((row.labels as string[]) ?? (writePatch.labels as string[] | undefined) ?? []);
    for (const a of addLabels) set.add(a);
    for (const x of removeLabels) set.delete(x);
    writePatch.labels = Array.from(set);
  }

  if (Object.keys(writePatch).length === 0) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_log")
    .update(writePatch)
    .eq("id", id)
    .eq("owner_user_email", owner)
    .select("id,is_read,is_starred,is_archived,is_trashed,is_spam,folder_id,labels")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, email: data });
}
