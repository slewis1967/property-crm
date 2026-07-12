/**
 * GET /api/broadcast/history
 *
 * Send-status view for bulk email. A broadcast is a one-step send_email
 * sequence created by POST /api/broadcast, identifiable by its slug prefix
 * (BROADCAST_SLUG_PREFIX). The NEXUS sequence_runner.py sends each enrolment
 * and writes back its status; this route reads those enrolments and rolls
 * them up per broadcast so the operator can see what actually happened
 * instead of the send being fire-and-forget.
 *
 * Bounded by design:
 *   - at most MAX_BROADCASTS (latest 25) broadcast sequences,
 *   - enrolments fetched only for that bounded id set, paged, with a hard
 *     MAX_ENROLLMENT_ROWS ceiling so a runaway table can't be pulled whole.
 *
 * Degrades gracefully: if the tables are missing/unreadable it returns
 * `{ ok: true, broadcasts: [], degraded: true }` rather than a 500, so the
 * UI just shows an empty history instead of an error.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import {
  tallyEnrollments,
  BROADCAST_SLUG_PREFIX,
  type EnrollmentRow,
} from "../../../../utils/broadcast-history";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";

const MAX_BROADCASTS = 25;
const ENROLL_PAGE = 1000;
// Safety ceiling: 25 broadcasts * a large audience is still bounded, but cap
// the total rows we'll pull so a pathological table can't blow up the lambda.
const MAX_ENROLLMENT_ROWS = 200_000;

interface SequenceRow {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  created_at: string | null;
}

export async function GET(req: Request) {
  // This route only reads bulk-send status (no mutation, no outbound), but it
  // exposes recipient counts/errors — gate it the same way the send route is.
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    // 1. Latest broadcast sequences, newest first.
    const { data: seqData, error: seqErr } = await supabase
      .from("sequences")
      .select("id,name,slug,description,created_at")
      .like("slug", `${BROADCAST_SLUG_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(MAX_BROADCASTS);

    if (seqErr) {
      log.warn("broadcast_history.sequences_query_failed", { error: seqErr.message });
      return NextResponse.json({ ok: true, broadcasts: [], degraded: true });
    }

    const sequences = (seqData ?? []) as SequenceRow[];
    if (sequences.length === 0) {
      return NextResponse.json({ ok: true, broadcasts: [] });
    }
    const ids = sequences.map((s) => s.id);

    // 2. Subjects from the step payloads (<= MAX_BROADCASTS rows). The sequence
    //    name already carries a truncated subject; the payload has the full one.
    const subjectById = new Map<string, string>();
    const { data: stepData } = await supabase
      .from("sequence_steps")
      .select("sequence_id,payload")
      .in("sequence_id", ids)
      .eq("position", 1);
    for (const st of (stepData ?? []) as { sequence_id: string; payload: unknown }[]) {
      const payload = (st.payload ?? {}) as { subject?: string };
      if (payload && typeof payload.subject === "string" && payload.subject.trim()) {
        subjectById.set(st.sequence_id, payload.subject.trim());
      }
    }

    // 3. Enrolments for the bounded id set. Paged with a stable order and a
    //    hard row ceiling. Group into per-sequence buckets and tally in JS
    //    (Supabase REST can't GROUP BY).
    const rowsBySeq = new Map<string, EnrollmentRow[]>();
    for (const id of ids) rowsBySeq.set(id, []);

    let from = 0;
    let fetched = 0;
    let enrolmentsDegraded = false;
    while (fetched < MAX_ENROLLMENT_ROWS) {
      const { data: enrData, error: enrErr } = await supabase
        .from("sequence_enrollments")
        .select("sequence_id,status,failed_reason")
        .in("sequence_id", ids)
        .order("id", { ascending: true })
        .range(from, from + ENROLL_PAGE - 1);

      if (enrErr) {
        log.warn("broadcast_history.enrollments_query_failed", { error: enrErr.message });
        enrolmentsDegraded = true;
        break;
      }
      if (!enrData || enrData.length === 0) break;

      for (const e of enrData as (EnrollmentRow & { sequence_id: string })[]) {
        const bucket = rowsBySeq.get(e.sequence_id);
        if (bucket) bucket.push({ status: e.status, failed_reason: e.failed_reason });
      }
      fetched += enrData.length;
      if (enrData.length < ENROLL_PAGE) break;
      from += ENROLL_PAGE;
    }

    const broadcasts = sequences.map((s) => {
      const breakdown = tallyEnrollments(rowsBySeq.get(s.id) ?? []);
      const nameSubject = String(s.name ?? "")
        .replace(/^broadcast\s*[—–-]\s*/i, "")
        .trim();
      const subject = subjectById.get(s.id) || nameSubject || "(no subject)";
      return {
        id: s.id,
        name: s.name,
        subject,
        slug: s.slug,
        created_at: s.created_at,
        audience_total: breakdown.total,
        sent: breakdown.sent,
        pending: breakdown.pending,
        failed: breakdown.failed,
        paused: breakdown.paused,
        sample_failed_reasons: breakdown.sampleFailedReasons,
      };
    });

    return NextResponse.json({
      ok: true,
      broadcasts,
      ...(enrolmentsDegraded ? { degraded: true } : {}),
    });
  } catch (e) {
    log.error("broadcast_history.unexpected", { ...errInfo(e) });
    return NextResponse.json({ ok: true, broadcasts: [], degraded: true });
  }
}
