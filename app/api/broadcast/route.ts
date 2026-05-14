/**
 * POST /api/broadcast
 *
 * Two-phase flow:
 *
 * Phase 1 — review (no acknowledge_violations flag, or false):
 *   Runs the subject + body through utils/compliance-review.ts. If any
 *   violations come back, responds {status: "review_required", violations}
 *   so the UI can warn before any DB writes.
 *
 * Phase 2 — send (acknowledge_violations=true):
 *   Skips the review (assumes Phase 1 has already happened and the operator
 *   acknowledged), inserts one row into sequences + one row into sequence_steps,
 *   then bulk-inserts sequence_enrollments for every eligible contact.
 *   The existing sequence_runner.py cron picks it up within 5 min and sends
 *   via Brevo, applying the Spam-Act footer + unsubscribe filter automatically.
 *
 * Eligibility filter (mirrors what the runner enforces anyway, as a friendly
 * pre-check so the UI can show an accurate enrolled_count):
 *   - contacts.email IS NOT NULL
 *   - optional: tag in contacts.tags (jsonb contains)
 *   - exclude any contact whose email matches a row in `unsubscribes`
 *     with channel IN ('email', 'all')
 *
 * The runner re-checks unsubscribes on every send anyway (defence in depth),
 * so a stale filter here can't accidentally email an opted-out contact.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { reviewBroadcastCopy, type Violation } from "../../../utils/compliance-review";
import { fetchEligibleContacts } from "../../../utils/broadcast-audience";

export const dynamic = "force-dynamic";

interface BroadcastInput {
  subject: string;
  html_body: string;
  text_body: string;
  tag: string | null;
  acknowledge_violations: boolean;
}

function genSlug(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const stamp =
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const suffix = Math.random().toString(36).slice(2, 5);
  return `broadcast-${stamp}-${suffix}`;
}

export async function POST(req: Request) {
  let body: Partial<BroadcastInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const subject = (body.subject ?? "").trim();
  const html_body = (body.html_body ?? "").trim();
  const text_body = (body.text_body ?? "").trim();
  const tag = body.tag ? String(body.tag).trim() : null;
  const acknowledge_violations = body.acknowledge_violations === true;

  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
  }
  if (!html_body) {
    return NextResponse.json({ ok: false, error: "html_body is required" }, { status: 400 });
  }

  // Phase 1: compliance review. Skipped if the operator already acknowledged
  // on a prior request.
  let violations: Violation[] = [];
  if (!acknowledge_violations) {
    try {
      const review = await reviewBroadcastCopy({ subject, html_body, text_body });
      violations = review.violations;
    } catch (e) {
      // If the compliance check itself fails (Anthropic outage, network), don't
      // block the operator — surface as a soft warning so the UI can decide.
      return NextResponse.json({
        ok: false,
        status: "review_failed",
        error: `compliance review failed: ${e instanceof Error ? e.message : String(e)}`,
        violations: [],
      }, { status: 200 });
    }
    if (violations.length > 0) {
      return NextResponse.json({
        ok: false,
        status: "review_required",
        violations,
      }, { status: 200 });
    }
  }

  // Phase 2: write the sequence + enrolments.
  const eligible = await fetchEligibleContacts(tag);
  const contactIds = eligible.map((c) => c.id);
  if (contactIds.length === 0) {
    return NextResponse.json({
      ok: false,
      error: tag
        ? `no eligible contacts found with tag "${tag}" (after excluding unsubscribed)`
        : "no eligible contacts found (after excluding unsubscribed)",
    }, { status: 400 });
  }

  const slug = genSlug();
  const subjectPreview = subject.length > 60 ? subject.slice(0, 57) + "..." : subject;
  const audienceLabel = tag ? `tag:${tag}` : "all contacts";

  const { data: seqRow, error: seqErr } = await supabase
    .from("sequences")
    .insert({
      slug,
      name: `Broadcast — ${subjectPreview}`,
      description:
        `Ad-hoc email broadcast sent ${new Date().toISOString()} from /broadcast UI to ${audienceLabel}.`,
      channel: "email",
      is_active: true,
    })
    .select("id")
    .single();
  if (seqErr || !seqRow) {
    return NextResponse.json({
      ok: false,
      error: `failed to create sequence: ${seqErr?.message ?? "unknown error"}`,
    }, { status: 500 });
  }
  const sequenceId = seqRow.id as string;

  const { error: stepErr } = await supabase
    .from("sequence_steps")
    .insert({
      sequence_id: sequenceId,
      position: 1,
      step_type: "send_email",
      delay_hours: 0,
      payload: { subject, html_body, text_body },
    });
  if (stepErr) {
    return NextResponse.json({
      ok: false,
      error: `failed to insert step: ${stepErr.message}`,
      sequence_id: sequenceId,
    }, { status: 500 });
  }

  // Chunked enrolment inserts. Supabase REST can handle 1000-row batches
  // comfortably; chunk to 500 to leave headroom.
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const rows = contactIds.slice(i, i + CHUNK).map((cid) => ({
      sequence_id: sequenceId,
      contact_id: cid,
      enrolled_by: "broadcast",
    }));
    const { error: enrErr } = await supabase.from("sequence_enrollments").insert(rows);
    if (enrErr) {
      return NextResponse.json({
        ok: false,
        error: `enrolment failed at chunk ${i / CHUNK}: ${enrErr.message}`,
        sequence_id: sequenceId,
        enrolled_count: inserted,
      }, { status: 500 });
    }
    inserted += rows.length;
  }

  // ETA: the runner sends one email at a time (~300ms each via Brevo), and
  // the cron fires every 5 min. Worst case: send starts at next tick (up to
  // 5 min wait) and finishes after N * 0.3s. Round up.
  const sendSeconds = Math.ceil(inserted * 0.3);
  const etaMinutes = Math.ceil(5 + sendSeconds / 60);

  return NextResponse.json({
    ok: true,
    sequence_id: sequenceId,
    slug,
    enrolled_count: inserted,
    audience: audienceLabel,
    eta_minutes: etaMinutes,
  });
}
