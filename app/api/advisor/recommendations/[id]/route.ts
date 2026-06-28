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
import { executeAndAudit } from "../../../../../utils/advisor-actions";
import { remember, slugify } from "../../../../../utils/memory";

import { requireAuth } from "../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const update: Record<string, string | null> = {};
  const now = new Date().toISOString();

  if (action === "apply" || action === "complete") {
    // If this recommendation carries a machine_action, "apply" must actually
    // RUN it — not just flip the status label. Previously this path was
    // status-only, so machine-actionable recs whose Auto-Apply was locked
    // behind the Senior gate got marked applied while nothing happened
    // (e.g. test builders that kept resurfacing every week). A human clicking
    // Apply IS the authority, so we execute here without the Senior gate —
    // but we still audit it and refuse to mark applied if execution fails.
    const { data: rec } = await supabase
      .from("recommendation_log")
      .select("machine_action")
      .eq("id", id)
      .single();
    if (rec?.machine_action) {
      const result = await executeAndAudit(id, rec.machine_action, "advisor:manual-apply");
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: `Action failed — not marked applied: ${result.error}` },
          { status: 400 },
        );
      }
    }
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

  // Feed dismissals into long-term memory so the Veteran advisor recalls them
  // PERMANENTLY and stops re-suggesting — recommendation_log's own dedupe only
  // looks back ~14 days, so anything dismissed earlier resurfaces without this.
  // Upsert by a deterministic slug so re-dismissing the same rec updates (not
  // duplicates). Best-effort: a memory hiccup must never fail the dismiss.
  if (action === "dismiss" && data) {
    try {
      await remember({
        kind: "learning",
        slug: `advisor-dismissed-${slugify(data.title)}`,
        title: `Dismissed advisor rec: ${data.title}`,
        body:
          `Sean dismissed this Veteran-advisor recommendation. ` +
          `Reason: ${update.dismissed_reason}. ` +
          `Do not re-suggest this or close variants of it.`,
        source: "advisor-feedback",
        tags: ["advisor", "dismissed"],
        confidence: 0.9,
        createdBy: typeof auth === "string" ? auth : "advisor",
      });
    } catch (e) {
      console.error("[advisor] dismissal→memory write failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ ok: true, recommendation: data });
}
