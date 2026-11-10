/**
 * POST /api/advisor/recommendations/{id}/execute
 *
 * Reads the recommendation's machine_action JSONB, validates it against
 * the allowlist, runs the corresponding mutation, marks the recommendation
 * as applied, and writes a row to recommendation_action_log for audit.
 *
 * Allowlist (must match veteran_advisor.py::_validate_machine_action):
 *   - set_app_setting
 *   - deactivate_builder / activate_builder / confirm_builder_draft
 *   - update_builder_field (extraction_notes / contact_email /
 *     contact_phone / auto_outreach_enabled)
 *
 * Anything outside the allowlist is rejected with 400 and the
 * recommendation stays pending. Sean falls back to the existing
 * Apply/Dismiss/Snooze human-only flow.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { executeAndAudit } from "../../../../../../utils/advisor-actions";
import { needsHumanApproval } from "../../../../../../utils/advisor-policy";

import { requireAuth } from "../../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: rec, error: fetchErr } = await supabase
    .from("recommendation_log")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !rec) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
  if (rec.status !== "pending" && rec.status !== "snoozed") {
    return NextResponse.json(
      { ok: false, error: `Recommendation already ${rec.status}` },
      { status: 409 },
    );
  }

  // Senior gate: Auto-Apply fires once the Senior Advisor has approved.
  // Per Sean (2026-06-29) risk_level no longer blocks — only destructive or
  // money-spending actions (APPROVAL_REQUIRED_KINDS) still need manual review.
  if (rec.senior_status !== "approved") {
    const labels: Record<string, string> = {
      pending_review: "still awaiting Senior Advisor review",
      rejected: "rejected by Senior Advisor",
      deferred: "deferred to Sean by Senior Advisor",
    };
    const friendly = labels[rec.senior_status] ?? `senior_status=${rec.senior_status}`;
    return NextResponse.json(
      { ok: false, error: `Auto-Apply blocked — recommendation ${friendly}.` },
      { status: 409 },
    );
  }
  if (needsHumanApproval(rec.machine_action)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Auto-Apply blocked — this action is destructive or spends money, so it needs your manual approval. Use 'Mark applied' once you've reviewed and accepted.",
      },
      { status: 409 },
    );
  }

  const result = await executeAndAudit(id, rec.machine_action, "advisor:auto-apply");

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  // Mark recommendation applied
  const now = new Date().toISOString();
  await supabase
    .from("recommendation_log")
    .update({
      status: "applied",
      applied_at: now,
      applied_by: "advisor:auto-apply",
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, summary: result.summary });
}
