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

import { requireAuth } from "../../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const ALLOWED_BUILDER_FIELDS = new Set([
  "extraction_notes", "contact_email", "contact_phone", "auto_outreach_enabled",
]);

type ExecResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

async function executeAction(action: any): Promise<ExecResult> {
  if (!action || typeof action !== "object") {
    return { ok: false, error: "no machine_action on recommendation" };
  }

  const kind = action.kind;

  if (kind === "set_app_setting") {
    const key = String(action.key ?? "").trim();
    if (!key) return { ok: false, error: "set_app_setting requires non-empty key" };
    if (!("value" in action)) return { ok: false, error: "set_app_setting requires value" };
    const { error } = await supabase
      .from("app_settings")
      .upsert(
        {
          key,
          value: action.value,
          updated_at: new Date().toISOString(),
          updated_by: "advisor:auto-apply",
        },
        { onConflict: "key" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, summary: `app_settings[${key}] updated` };
  }

  if (
    kind === "deactivate_builder" ||
    kind === "activate_builder" ||
    kind === "confirm_builder_draft"
  ) {
    const builderId = String(action.builder_id ?? "");
    if (builderId.length !== 36) {
      return { ok: false, error: `${kind} requires uuid builder_id` };
    }
    const update: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (kind === "deactivate_builder") update.active = false;
    if (kind === "activate_builder") update.active = true;
    if (kind === "confirm_builder_draft") update.draft = false;

    const { data, error } = await supabase
      .from("builders")
      .update(update)
      .eq("id", builderId)
      .select("canonical_name")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, summary: `${kind} on '${data?.canonical_name ?? builderId}'` };
  }

  if (kind === "update_builder_field") {
    const builderId = String(action.builder_id ?? "");
    const field = String(action.field ?? "");
    if (builderId.length !== 36) {
      return { ok: false, error: "update_builder_field requires uuid builder_id" };
    }
    if (!ALLOWED_BUILDER_FIELDS.has(field)) {
      return { ok: false, error: `field '${field}' not in allowlist` };
    }
    if (!("value" in action)) {
      return { ok: false, error: "update_builder_field requires value" };
    }
    const update: Record<string, any> = {
      [field]: action.value,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("builders")
      .update(update)
      .eq("id", builderId)
      .select("canonical_name")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, summary: `${field} updated on '${data?.canonical_name ?? builderId}'` };
  }

  return { ok: false, error: `unknown machine_action.kind: ${kind}` };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(req);
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

  // Senior gate: Auto-Apply only fires when the Senior Advisor has
  // approved AND the risk level isn't 'high'. Anything high-risk needs
  // Sean to review manually (he can still hit "Mark applied" — that
  // path is human-only and bypasses this gate).
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
  if (rec.risk_level === "high") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Auto-Apply blocked — high-risk action requires manual review by Sean. Use 'Mark applied' if you've reviewed and accepted.",
      },
      { status: 409 },
    );
  }

  const result = await executeAction(rec.machine_action);

  // Audit row regardless of outcome
  await supabase.from("recommendation_action_log").insert({
    recommendation_id: id,
    action: rec.machine_action ?? null,
    status: result.ok ? "success" : "failed",
    error: result.ok ? null : result.error,
    executed_by: "advisor:auto-apply",
  });

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
