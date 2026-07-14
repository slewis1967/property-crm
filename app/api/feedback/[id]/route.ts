import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_MIGRATION_HINT,
  feedbackErrMessage,
  feedbackTableMissing,
  isFeedbackStatus,
  isFeedbackPriority,
  type FeedbackPriority,
  type FeedbackStatus,
} from "../../../../utils/feedback";

export const dynamic = "force-dynamic";

/** PATCH — update an item's status or priority (operator triage). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: { status?: unknown; priority?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: { status?: FeedbackStatus; priority?: FeedbackPriority; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (isFeedbackStatus(body.status)) patch.status = body.status;
  if (isFeedbackPriority(body.priority)) patch.priority = body.priority;
  if (!patch.status && !patch.priority) {
    return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("feedback")
      .update(patch)
      .eq("id", id)
      .select(FEEDBACK_COLUMNS)
      .single();
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: FEEDBACK_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, item: data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not update feedback") }, { status: 500 });
  }
}
