/**
 * Advisor auto-apply policy — shared by the CRM API, the CRM UI, and (mirrored)
 * by senior_advisor.py.
 *
 * Rule (confirmed by Sean 2026-06-29): the Veteran/Senior advisor auto-applies
 * EVERY Senior-approved recommendation that carries an allowlisted machine_action,
 * regardless of risk_level. The ONLY actions that still require Sean's explicit
 * approval are those that are **destructive** (irreversible data loss) or that
 * **cost money / send externally**.
 *
 * None of the current allowlisted machine_actions qualify (set_app_setting,
 * activate/deactivate/confirm builder, update_builder_field — all internal,
 * reversible, free), so in practice everything actionable now auto-applies.
 * When a destructive/paid/external action kind is added to the executor, add its
 * `kind` here to re-gate it behind manual approval.
 *
 * This module deliberately has NO imports so it is safe to use from both
 * server code and "use client" components (it must never pull in the
 * service-key Supabase client).
 */
export const APPROVAL_REQUIRED_KINDS = new Set<string>([
  // e.g. "delete_builder", "purge_data", "send_broadcast", "purchase_credits"
]);

/** True if this machine_action must wait for Sean (destructive or costs money). */
export function needsHumanApproval(action: unknown): boolean {
  if (!action || typeof action !== "object") return false;
  const kind = (action as { kind?: unknown }).kind;
  return typeof kind === "string" && APPROVAL_REQUIRED_KINDS.has(kind);
}
