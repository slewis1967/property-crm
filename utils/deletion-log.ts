/**
 * Deletion gate + audit trail for CLIENT (contact) and OPPORTUNITY deletions.
 *
 * Business rule (user's words): "When deleting a client/opportunity from the
 * CRM the user will need to add their reason for doing so and their name."
 *
 * Two concerns live here:
 *
 *  1. VALIDATION (pure). `validateDeletionInput` turns a request body into
 *     either the cleaned {reason, deleterName} or an error string. It is pure /
 *     side-effect free so both the API routes and the unit tests can use it
 *     without a DB. The routes reject with 400 when it returns an error, so the
 *     reason+name gate holds even if a client bypasses the modal.
 *
 *  2. AUDIT LOG (append-only, fail-open). `recordDeletion` writes one row per
 *     deleted entity to `deletion_log`, snapshotting the record for recovery
 *     (opportunity deletes are HARD deletes in NEXUS — otherwise unrecoverable).
 *     It NEVER throws: a missing table (migration not applied) degrades to a
 *     single warning; any other failure is logged loudly. The reason+name gate
 *     is enforced separately at the validation layer, so a missing audit table
 *     must not strand the user — the delete still proceeds.
 */

import { supabase } from "./supabase";
import { log } from "./logger";

export type DeletionEntityType = "contact" | "opportunity";

export interface DeletionInput {
  reason: string;
  deleterName: string;
}

/**
 * Validate a delete request body. Returns the trimmed {reason, deleterName} on
 * success, or `{ error }` describing the first missing/blank field. Both fields
 * are REQUIRED and must be non-blank after trimming.
 *
 * Pure: no I/O, safe to unit-test.
 */
export function validateDeletionInput(
  body: unknown,
): { ok: true; value: DeletionInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  const deleterName = typeof b.deleter_name === "string" ? b.deleter_name.trim() : "";
  if (!reason) return { ok: false, error: "A reason for deletion is required." };
  if (!deleterName) return { ok: false, error: "Your name is required to delete." };
  return { ok: true, value: { reason, deleterName } };
}

/**
 * True when the failure is just "deletion_log not created yet" (migration not
 * applied). Mirrors the table-missing helper in compliance-audit: match the
 * table-level codes, and only fall back to a substring test naming a table, so a
 * missing-column error isn't mistaken for a missing table.
 */
function tableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}

// Warn only once when the table is absent, so a pre-migration deployment
// doesn't spam the logs on every delete.
let warnedTableMissing = false;

/**
 * Append one row to the deletion log. FAIL-OPEN: never throws. Call it BEFORE
 * performing the actual delete (so the snapshot captures the live record), but
 * do not block the delete on its outcome. A missing table (migration not yet
 * applied) degrades to a single warning; any other failure is logged loudly.
 */
export async function recordDeletion(params: {
  entityType: DeletionEntityType;
  entityId: string;
  entityLabel?: string | null;
  reason: string;
  deleterName: string;
  deleterEmail?: string | null;
  snapshot?: unknown;
}): Promise<void> {
  try {
    const { error } = await supabase.from("deletion_log").insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      entity_label: params.entityLabel ?? null,
      reason: params.reason,
      deleter_name: params.deleterName,
      deleter_email: params.deleterEmail ?? null,
      record_snapshot: params.snapshot ?? null,
    });
    if (error) {
      if (tableMissing(error)) {
        if (!warnedTableMissing) {
          warnedTableMissing = true;
          log.warn("deletion_log.table_missing", {
            detail:
              "deletion_log not found — run migrations/20260713_deletion_log.sql to enable the deletion audit trail. Deletes still proceed; reason+name are still required at the API layer.",
          });
        }
        return;
      }
      throw error;
    }
  } catch (e) {
    // FAIL-OPEN: do not block the delete on an audit failure. Log loudly.
    log.error("deletion_log.record_failed", {
      entityType: params.entityType,
      entityId: params.entityId,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}
