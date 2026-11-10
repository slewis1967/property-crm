import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_COLUMNS_BASE,
  FEEDBACK_MIGRATION_HINT,
  feedbackAiColumnsMissing,
  feedbackErrMessage,
  feedbackTableMissing,
  isFeedbackStatus,
  isFeedbackPriority,
  type FeedbackPriority,
  type FeedbackStatus,
  type FeedbackSignoff,
} from "../../../../utils/feedback";

export const dynamic = "force-dynamic";

/** PATCH — operator actions on an item:
 *   { status }    — manual triage state
 *   { priority }  — manual priority
 *   { signoff }   — approve/reject a feature plan or a held (risk-class) fix.
 *                   Approve leaves it at `awaiting_signoff` with signoff=approved
 *                   so the cloud routine implements/merges it; reject skips it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = auth;
  const { id } = await params;

  let body: { status?: unknown; priority?: unknown; signoff?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  let touchesAiColumns = false;

  if (isFeedbackStatus(body.status)) patch.status = body.status as FeedbackStatus;
  if (isFeedbackPriority(body.priority)) patch.priority = body.priority as FeedbackPriority;

  if (body.signoff === "approved" || body.signoff === "rejected") {
    const signoff = body.signoff as FeedbackSignoff;
    patch.signoff = signoff;
    patch.signoff_by = actor;
    patch.signoff_at = new Date().toISOString();
    // Reject → drop out of the pipeline. Approve → stay at awaiting_signoff so
    // the routine sees signoff=approved and implements/merges it.
    if (signoff === "rejected") patch.agent_stage = "skipped";
    touchesAiColumns = true;
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("feedback")
      .update(patch)
      .eq("id", id)
      .select(touchesAiColumns ? FEEDBACK_COLUMNS : FEEDBACK_COLUMNS_BASE)
      .single();
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: FEEDBACK_MIGRATION_HINT }, { status: 503 });
      }
      if (feedbackAiColumnsMissing(error)) {
        return NextResponse.json(
          { ok: false, error: "Run migrations/20260714_feedback_ai.sql to enable sign-off." },
          { status: 503 },
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not update feedback") }, { status: 500 });
  }
}
