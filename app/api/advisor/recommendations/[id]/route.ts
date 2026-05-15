/**
 * POST /api/advisor/recommendations/{id}
 *   Body: {
 *     action: "apply" | "dismiss" | "snooze" | "start" | "complete" | "reopen",
 *     reason?: string,
 *     snooze_days?: number
 *   }
 *
 * State transitions:
 *   pending|snoozed → applied      (action: "apply")
 *   pending|snoozed → dismissed    (action: "dismiss")
 *   pending|snoozed → snoozed      (action: "snooze")
 *   pending|snoozed → in_progress  (action: "start")
 *   in_progress     → applied      (action: "complete")
 *   in_progress     → pending      (action: "reopen") — gave up, back to queue
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

import { requireAuth } from "../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const update: Record<string, any> = {};
  const now = new Date().toISOString();

  if (action === "apply" || action === "complete") {
    update.status = "applied";
    update.applied_at = now;
    update.applied_by = body.applied_by ?? "advisor";
  } else if (action === "dismiss") {
    update.status = "dismissed";
    update.dismissed_at = now;
    update.dismissed_reason = body.reason ?? "no reason given";
  } else if (action === "snooze") {
    const days = Math.max(1, Math.min(parseInt(body.snooze_days ?? 7, 10), 90));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    update.status = "snoozed";
    update.snoozed_until = until;
  } else if (action === "start") {
    update.status = "in_progress";
    update.started_at = now;
    update.started_by = body.started_by ?? "advisor";
  } else if (action === "reopen") {
    // Back to pending. Clear started_* so the row reads "untouched"
    // again — audit lives in recommendation_action_log if we ever need
    // to recover the abandoned attempt.
    update.status = "pending";
    update.started_at = null;
    update.started_by = null;
  } else {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("recommendation_log")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recommendation: data });
}
