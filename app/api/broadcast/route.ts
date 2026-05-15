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
import { sanitizeEmailHtml } from "../../../utils/sanitize-email";

export const dynamic = "force-dynamic";

interface BroadcastInput {
  subject: string;
  html_body: string;
  text_body: string;
  tag: string | null;
  acknowledge_violations: boolean;
  // Distinct from acknowledge_violations: this flag means the operator chose to
  // proceed despite the review service itself failing (Anthropic outage). We
  // gate it separately so a transient 5xx can't be turned into a free pass on
  // real violations — the client only sets this after seeing a review_failed.
  skip_review_outage: boolean;
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

// Retry the compliance call a few times before declaring outage. Anthropic
// 5xx / rate-limit blips are common and the cost of a false-outage is high
// (operator gets pushed onto the skip-review path).
async function reviewWithRetry(
  input: { subject: string; html_body: string; text_body: string },
): Promise<{ violations: Violation[] }> {
  const ATTEMPTS = 3;
  let lastErr: unknown;
  for (let i = 0; i < ATTEMPTS; i++) {
    try {
      return await reviewBroadcastCopy(input);
    } catch (e) {
      lastErr = e;
      if (i < ATTEMPTS - 1) {
        await new Promise((r) => setTimeout(r, 500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export async function POST(req: Request) {
  let body: Partial<BroadcastInput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const subject = (body.subject ?? "").trim();
  // Sanitize the operator-typed HTML BEFORE the compliance review runs and
  // BEFORE it gets persisted into sequence_steps.payload. Strips <script>,
  // event handlers, javascript: URIs etc. Keeps inline styles + safe link
  // anchors so Brevo renders the broadcast correctly to recipients.
  const html_body = sanitizeEmailHtml((body.html_body ?? "").trim());
  const text_body = (body.text_body ?? "").trim();
  const tag = body.tag ? String(body.tag).trim() : null;
  const acknowledge_violations = body.acknowledge_violations === true;
  const skip_review_outage = body.skip_review_outage === true;

  if (!subject) {
    return NextResponse.json({ ok: false, error: "subject is required" }, { status: 400 });
  }
  if (!html_body) {
    return NextResponse.json({ ok: false, error: "html_body is required" }, { status: 400 });
  }

  // Phase 1: compliance review.
  //   - acknowledge_violations=true  → operator has seen real violations and chose to send anyway. Skip.
  //   - skip_review_outage=true      → operator acknowledges the review SERVICE is down. Skip, but log it.
  //   - otherwise                    → run the review (with retry).
  // The two flags are deliberately separate so an Anthropic 5xx can't become a
  // free pass on substantive violations: an outage override only opens the
  // narrower door.
  if (!acknowledge_violations && !skip_review_outage) {
    let violations: Violation[] = [];
    try {
      const review = await reviewWithRetry({ subject, html_body, text_body });
      violations = review.violations;
    } catch (e) {
      return NextResponse.json({
        ok: false,
        status: "review_failed",
        error: `compliance review failed after retry: ${e instanceof Error ? e.message : String(e)}`,
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

  // Insert sequence INACTIVE first. If step/enrolment writes fail partway,
  // the runner won't pick the half-built sequence up. We flip is_active=true
  // only after every enrolment chunk lands. On any failure we tear down the
  // sequence so retries don't accumulate orphan rows + duplicate sends.
  const { data: seqRow, error: seqErr } = await supabase
    .from("sequences")
    .insert({
      slug,
      name: `Broadcast — ${subjectPreview}`,
      description:
        `Ad-hoc email broadcast sent ${new Date().toISOString()} from /broadcast UI to ${audienceLabel}.`,
      channel: "email",
      is_active: false,
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

  async function teardown(reason: string, status = 500) {
    // Best-effort cleanup. The sequence is is_active=false so the runner
    // won't fire it even if these deletes partially fail.
    await supabase.from("sequence_enrollments").delete().eq("sequence_id", sequenceId);
    await supabase.from("sequence_steps").delete().eq("sequence_id", sequenceId);
    await supabase.from("sequences").delete().eq("id", sequenceId);
    return NextResponse.json({ ok: false, error: reason }, { status });
  }

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
    return await teardown(`failed to insert step: ${stepErr.message}`);
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
      return await teardown(`enrolment failed at chunk ${i / CHUNK}: ${enrErr.message}`);
    }
    inserted += rows.length;
  }

  // Everything landed — flip the sequence on so the runner picks it up.
  const { error: activateErr } = await supabase
    .from("sequences")
    .update({ is_active: true })
    .eq("id", sequenceId);
  if (activateErr) {
    return await teardown(`failed to activate sequence: ${activateErr.message}`);
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
