/**
 * Broadcast history helpers.
 *
 * A "broadcast" is just a one-step `send_email` sequence created by
 * POST /api/broadcast. It has no dedicated marker column — instead the
 * route stamps a recognisable `slug` prefix (see BROADCAST_SLUG_PREFIX,
 * used by genSlug() in app/api/broadcast/route.ts). The history view keys
 * off that prefix, so no DB migration is needed.
 *
 * This module is intentionally free of any Supabase / IO import so the
 * pure status-aggregation (tallyEnrollments) can be unit-tested in
 * isolation and reused by the /api/broadcast/history route.
 */

/** Slug prefix stamped on every broadcast sequence by /api/broadcast. */
export const BROADCAST_SLUG_PREFIX = "broadcast-";

/** Minimal enrollment shape the aggregation needs. */
export interface EnrollmentRow {
  status: string | null;
  failed_reason?: string | null;
}

/** Status breakdown for a single broadcast. */
export interface StatusBreakdown {
  /** Total enrolments (= audience the broadcast was queued to). */
  total: number;
  /** status = "completed" → the runner sent it. */
  sent: number;
  /** status = "active" (or null / unknown) → not yet processed. */
  pending: number;
  /** status = "failed" → the runner tried and errored. */
  failed: number;
  /** status = "paused" → held (e.g. mid-flight pause). */
  paused: number;
  /** Up to a few distinct `failed_reason` values, for a tooltip/expand. */
  sampleFailedReasons: string[];
}

const MAX_SAMPLE_REASONS = 3;

/**
 * Fold a list of enrollment rows into a status breakdown.
 *
 * Mapping (sequence_runner.py's status vocabulary):
 *   completed → sent
 *   failed    → failed  (collect a few distinct failed_reason samples)
 *   paused    → paused
 *   active / null / anything else → pending
 *
 * Pure: no IO, deterministic, safe to unit-test.
 */
export function tallyEnrollments(rows: EnrollmentRow[]): StatusBreakdown {
  const b: StatusBreakdown = {
    total: 0,
    sent: 0,
    pending: 0,
    failed: 0,
    paused: 0,
    sampleFailedReasons: [],
  };
  const seenReasons = new Set<string>();

  for (const r of rows) {
    b.total++;
    const s = (r.status ?? "").trim().toLowerCase();
    if (s === "completed") {
      b.sent++;
    } else if (s === "failed") {
      b.failed++;
      const reason = (r.failed_reason ?? "").trim();
      if (
        reason &&
        !seenReasons.has(reason) &&
        b.sampleFailedReasons.length < MAX_SAMPLE_REASONS
      ) {
        seenReasons.add(reason);
        b.sampleFailedReasons.push(reason);
      }
    } else if (s === "paused") {
      b.paused++;
    } else {
      // active, null, empty, or any unrecognised status = still in flight.
      b.pending++;
    }
  }

  return b;
}
