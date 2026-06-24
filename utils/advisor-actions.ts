/**
 * Shared executor for Veteran Advisor `machine_action`s.
 *
 * Both the Auto-Apply endpoint (`/execute`) and the human Apply path
 * (`/[id]` with action="apply"|"complete") run actions through here so
 * there is ONE place that performs the mutation + writes the audit row.
 *
 * Why this exists: previously only `/execute` ran the action. The human
 * "Mark applied" button just flipped status→applied without doing anything,
 * so machine-actionable recs (e.g. "deactivate test builder") whose
 * Auto-Apply was locked behind the Senior gate got marked applied while
 * the builder stayed live — and the Advisor re-flagged them every week.
 *
 * Allowlist (must match veteran_advisor.py::_validate_machine_action):
 *   - set_app_setting
 *   - deactivate_builder / activate_builder / confirm_builder_draft
 *   - update_builder_field (extraction_notes / contact_email /
 *     contact_phone / auto_outreach_enabled)
 */
import { supabase } from "./supabase";

const ALLOWED_BUILDER_FIELDS = new Set([
  "extraction_notes", "contact_email", "contact_phone", "auto_outreach_enabled",
]);

export type ExecResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

/** Run a single allowlisted machine_action. Pure mutation — no status/audit writes. */
export async function executeAction(action: any): Promise<ExecResult> {
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

/**
 * Run an action AND write the audit row. Used by both endpoints so the
 * audit log captures every attempt regardless of which button triggered it.
 * `executedBy` distinguishes "advisor:auto-apply" from "advisor:manual-apply".
 */
export async function executeAndAudit(
  recommendationId: string,
  action: any,
  executedBy: string,
): Promise<ExecResult> {
  const result = await executeAction(action);
  await supabase.from("recommendation_action_log").insert({
    recommendation_id: recommendationId,
    action: action ?? null,
    status: result.ok ? "success" : "failed",
    error: result.ok ? null : result.error,
    executed_by: executedBy,
  });
  return result;
}
