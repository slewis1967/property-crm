/**
 * PATCH — a super admin's decision on a help request:
 *   { action: "publish", draft }   — approve (optionally edited) and show it in the help panel
 *   { action: "decline", reason }  — turn it down; the requester sees the reason
 *   { action: "unpublish" }        — take a published guide back down for another look
 *
 * Only a super admin can do any of these. Publishing is the one step that puts
 * new instructions in front of all staff, so it is never automatic.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { isSuperAdmin } from "../../../../../utils/super-admin";
import { errMessage } from "../../../../../utils/errors";
import { HELP_REQUEST_COLUMNS, draftPersonalDetails, parseDraft } from "../../../../../utils/help/requests";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!isSuperAdmin(auth)) {
    return NextResponse.json({ ok: false, error: "Only a super admin can review requests." }, { status: 403 });
  }
  const { id } = await params;

  let body: { action?: unknown; draft?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let patch: Record<string, unknown>;
  if (body.action === "publish") {
    const draft = parseDraft(body.draft);
    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "A guide needs a title, a summary and at least two steps." },
        { status: 400 },
      );
    }
    const leaked = draftPersonalDetails(draft);
    if (leaked) return NextResponse.json({ ok: false, error: leaked }, { status: 400 });
    patch = { status: "published", draft, decline_reason: null, reviewed_by: auth, reviewed_at: now, updated_at: now };
  } else if (body.action === "decline") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
    if (!reason) return NextResponse.json({ ok: false, error: "Give a short reason." }, { status: 400 });
    patch = { status: "declined", decline_reason: reason, reviewed_by: auth, reviewed_at: now, updated_at: now };
  } else if (body.action === "unpublish") {
    patch = { status: "drafted", reviewed_by: auth, reviewed_at: now, updated_at: now };
  } else {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("help_requests")
    .update(patch)
    .eq("id", id)
    .select(HELP_REQUEST_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: errMessage(error, "Could not save") }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Request not found." }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}
