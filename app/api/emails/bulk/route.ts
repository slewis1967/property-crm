/**
 * PATCH /api/emails/bulk
 *   Body: { ids: string[], patch: { is_read?, is_starred?, is_archived?,
 *                                    is_trashed?, is_spam?, folder_id?,
 *                                    labels?, add_labels?, remove_labels? } }
 *
 * Apply the same state mutation to many email_log rows in one call. Only
 * the columns listed above are settable here — body/subject/threading are
 * immutable post-send. Ownership is enforced: rows not belonging to the
 * authenticated user are ignored (not errored — partial-selection across
 * a mixed-owner thread shouldn't fail the whole batch).
 *
 * labels semantics:
 *   - `labels` REPLACES the array
 *   - `add_labels` appends (unioned) — used by "apply label" bulk action
 *   - `remove_labels` subtracts
 *
 * Returns { ok, updated: <number of rows actually mutated> }
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

const ALLOWED_BOOLS = [
  "is_read", "is_starred", "is_archived", "is_trashed", "is_spam",
] as const;

export async function PATCH(req: Request) {
  const owner = userEmailFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const patch: Record<string, unknown> = body?.patch ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }
  const cleanIds = ids.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (cleanIds.length === 0) {
    return NextResponse.json({ ok: false, error: "ids must be non-empty strings" }, { status: 400 });
  }

  const writePatch: Record<string, unknown> = {};
  for (const k of ALLOWED_BOOLS) {
    if (typeof patch[k] === "boolean") writePatch[k] = patch[k];
  }
  if ("folder_id" in patch) writePatch.folder_id = patch.folder_id ?? null;

  // If a hard 'labels' replacement is provided we use it directly.
  // Otherwise compose adds/removes per-row below (since arrays need
  // per-row read-modify-write).
  const replaceLabels = Array.isArray(patch.labels) ? (patch.labels as string[]) : null;
  const addLabels    = Array.isArray(patch.add_labels)    ? (patch.add_labels    as string[]) : [];
  const removeLabels = Array.isArray(patch.remove_labels) ? (patch.remove_labels as string[]) : [];

  // Common case: only boolean/folder/labels-replace, no add/remove. Single
  // UPDATE round trip handles it.
  if (replaceLabels && addLabels.length === 0 && removeLabels.length === 0) {
    writePatch.labels = replaceLabels;
  }

  const hasSimpleWrites = Object.keys(writePatch).length > 0;
  const hasComposeLabels = addLabels.length > 0 || removeLabels.length > 0;

  if (!hasSimpleWrites && !hasComposeLabels) {
    return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
  }

  let updated = 0;

  if (hasSimpleWrites) {
    const { data, error } = await supabase
      .from("email_log")
      .update(writePatch)
      .in("id", cleanIds)
      .eq("owner_user_email", owner)
      .select("id");
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    updated += data?.length ?? 0;
  }

  if (hasComposeLabels) {
    // Read current labels per matching row, then write the union/diff back.
    // Limited to the same owner+ids set so we don't touch other users' mail.
    const { data: rows, error: readErr } = await supabase
      .from("email_log")
      .select("id,labels")
      .in("id", cleanIds)
      .eq("owner_user_email", owner);
    if (readErr) return NextResponse.json({ ok: false, error: readErr.message }, { status: 500 });

    for (const r of rows ?? []) {
      const current = new Set<string>((r.labels as string[]) ?? []);
      for (const a of addLabels) current.add(a);
      for (const x of removeLabels) current.delete(x);
      const { error: upErr } = await supabase
        .from("email_log")
        .update({ labels: Array.from(current) })
        .eq("id", r.id)
        .eq("owner_user_email", owner);
      if (!upErr) updated += 1;
    }
  }

  return NextResponse.json({ ok: true, updated });
}
