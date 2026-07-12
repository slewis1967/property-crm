/**
 * Audit trail + sign-lock immutability for the three NCCP/Equifax compliance
 * documents (Borrower Fact Find, NCCP Needs Analysis, Credit File Authorisation).
 *
 * Two concerns live here:
 *
 *  1. SIGN-LOCK (pure logic). "Locked" is DERIVED FROM `status` — each document
 *     has a terminal status (fact_find/needs_analysis → "Complete",
 *     credit_authorisation → "signed"). There is no separate `locked` column, so
 *     status is the single source of truth. `classifyPatch` turns a
 *     (currentStatus, incomingStatus) pair into an update/sign/reopen/reject
 *     decision the routes act on. These functions are pure and side-effect free
 *     so they can be unit-tested without a DB (and, via the per-doc terminal
 *     constants, the client forms derive the same "locked" state).
 *
 *  2. AUDIT LOG (append-only). `recordAudit` writes one row per change to
 *     `compliance_document_audit`. It is FAIL-OPEN: the document write has
 *     already committed by the time we get here (Supabase REST can't do a
 *     multi-table transaction), so an audit-insert failure must NOT surface to
 *     the user as a lost save — but it IS logged loudly so it can't pass
 *     silently. If the audit table doesn't exist yet (migration not applied), we
 *     degrade like the doc tables do: warn once, don't crash.
 */

import { supabase } from "./supabase";
import { log } from "./logger";
import { FACT_FIND_TERMINAL_STATUS } from "./factfind";
import { NEEDS_ANALYSIS_TERMINAL_STATUS } from "./needsAnalysis";
import { CREDIT_AUTHORISATION_TERMINAL_STATUS } from "./creditAuthorisation";

/* ── Types ───────────────────────────────────────────────────────────────── */

export type ComplianceDocType = "fact_find" | "needs_analysis" | "credit_authorisation";
export type ComplianceAuditAction = "create" | "update" | "sign" | "reopen" | "delete";

/** The status at which each document is signed/complete and becomes read-only. */
export const LOCKED_STATUS: Record<ComplianceDocType, string> = {
  fact_find: FACT_FIND_TERMINAL_STATUS,
  needs_analysis: NEEDS_ANALYSIS_TERMINAL_STATUS,
  credit_authorisation: CREDIT_AUTHORISATION_TERMINAL_STATUS,
};

/** User-facing refusal messages (kept here so route wording stays consistent). */
export const LOCKED_EDIT_MESSAGE =
  "This document is signed/locked and can't be edited. Reopen it to make changes.";
export const LOCKED_DELETE_MESSAGE = "Signed documents can't be deleted.";

/* ── Pure lock logic ─────────────────────────────────────────────────────── */

/** True when a document at `status` is at its terminal (signed/complete) value. */
export function isLocked(docType: ComplianceDocType, status: string | null | undefined): boolean {
  return status === LOCKED_STATUS[docType];
}

/**
 * How a PATCH should be treated, given the document's current status and the
 * status it would have after the change (`incomingStatus` — for a PATCH that
 * doesn't touch status, pass the current status through):
 *
 *   - not locked → locked      : "sign"   (apply + audit)
 *   - not locked → not locked  : "update" (apply + audit)
 *   - locked     → not locked  : "reopen" (allow — unlocks for amendment + audit)
 *   - locked     → locked      : "reject" (refuse with 409; content of a signed
 *                                          document can't be edited in place)
 *
 * The audit action is the decision kind for the three applied cases.
 */
export type PatchDecision =
  | { kind: "update"; statusAfter: string }
  | { kind: "sign"; statusAfter: string }
  | { kind: "reopen"; statusAfter: string }
  | { kind: "reject" };

export function classifyPatch(
  docType: ComplianceDocType,
  currentStatus: string,
  incomingStatus: string,
): PatchDecision {
  const currentlyLocked = isLocked(docType, currentStatus);
  const willBeLocked = isLocked(docType, incomingStatus);

  if (currentlyLocked) {
    // Only a move OUT of the locked status is allowed (reopen). Any other edit
    // to a signed document is refused.
    return willBeLocked ? { kind: "reject" } : { kind: "reopen", statusAfter: incomingStatus };
  }
  return willBeLocked
    ? { kind: "sign", statusAfter: incomingStatus }
    : { kind: "update", statusAfter: incomingStatus };
}

/* ── Audit table plumbing ────────────────────────────────────────────────── */

/**
 * True when the failure is just "audit table not created yet" (migration not
 * applied). Mirrors the *TableMissing helpers in the doc utils: match the
 * table-level codes, and only fall back to a substring test naming a table, so a
 * missing-column error isn't mistaken for a missing table.
 */
function auditTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}

// Warn only once when the audit table is absent, so a pre-migration deployment
// doesn't spam the logs on every save.
let warnedTableMissing = false;

/**
 * Append one row to the audit log. FAIL-OPEN: never throws — the document write
 * has already happened and must not be undone by an audit failure. A genuine
 * failure is logged at error level (loud, greppable). A missing table (migration
 * not yet applied) degrades to a single warning.
 *
 * NOTE (non-transactional): Supabase REST can't wrap the doc write and this
 * audit write in one transaction, so the audit row is inserted right after the
 * doc write. In the rare window where the doc write succeeds and this insert
 * fails, the change is applied but unaudited — surfaced by the error log rather
 * than lost.
 */
export async function recordAudit(params: {
  docType: ComplianceDocType;
  docId: string;
  action: ComplianceAuditAction;
  changedBy: string;
  statusAfter?: string | null;
  snapshot?: unknown;
  note?: string;
}): Promise<void> {
  try {
    const { error } = await supabase.from("compliance_document_audit").insert({
      doc_type: params.docType,
      doc_id: params.docId,
      action: params.action,
      changed_by: params.changedBy,
      status_after: params.statusAfter ?? null,
      data_snapshot: params.snapshot ?? null,
      note: params.note ?? null,
    });
    if (error) {
      if (auditTableMissing(error)) {
        if (!warnedTableMissing) {
          warnedTableMissing = true;
          log.warn("compliance_audit.table_missing", {
            detail: "compliance_document_audit not found — run migrations/20260712_compliance_audit.sql to enable the audit trail.",
          });
        }
        return;
      }
      throw error;
    }
  } catch (e) {
    // FAIL-OPEN: the doc write already committed; don't rethrow. Log loudly.
    log.error("compliance_audit.record_failed", {
      docType: params.docType,
      docId: params.docId,
      action: params.action,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** A history row as returned to the UI (no `data_snapshot` — PII stays server-side). */
export type ComplianceAuditRow = {
  id: string;
  doc_type: string;
  doc_id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  status_after: string | null;
  note: string | null;
};

/** Explicit columns for the history endpoint. Never `select("*")` — omit the snapshot. */
const HISTORY_COLUMNS = "id,doc_type,doc_id,action,changed_by,changed_at,status_after,note";

/**
 * The audit trail for one document, newest first. Returns [] (not an error) when
 * the audit table hasn't been created yet, so the history panel degrades like
 * the rest of the feature. Throws on any other failure for the route to handle.
 */
export async function fetchAuditHistory(
  docType: ComplianceDocType,
  docId: string,
): Promise<ComplianceAuditRow[]> {
  const { data, error } = await supabase
    .from("compliance_document_audit")
    .select(HISTORY_COLUMNS)
    .eq("doc_type", docType)
    .eq("doc_id", docId)
    .order("changed_at", { ascending: false })
    .limit(500);
  if (error) {
    if (auditTableMissing(error)) return [];
    throw error;
  }
  return (data ?? []) as ComplianceAuditRow[];
}
