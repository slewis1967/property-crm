/**
 * POST /api/opportunities/reengage
 *
 * Manual "Send re-engagement email" action for the Opportunities "No
 * response" tab (see feedback item "NO RESPONSE"). Deliberately modelled on
 * /api/broadcast — same compliance-review-then-sequence-enrolment mechanism
 * — but scoped to an explicit list of contact_ids (the operator's selection)
 * rather than a tag-based audience, and using a fixed system template rather
 * than operator-authored copy.
 *
 * This is an operator-triggered send, not an unattended cron. An always-on
 * hourly automation was in the original feature request, but this repo has
 * no existing pattern for a scheduled Next.js route (the sequence engine's
 * own cron lives outside this app, in sequence_runner.py) and there's no
 * inbound-SMS reply tracking to safely gate a fully automatic trigger on
 * (see the gap noted in app/api/opportunities/no-response/route.ts). Shipping
 * the manual version first is the smaller, safer step — full automation is
 * a follow-up once Sean's confirmed the inbound-reply approach.
 */
import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";
import { requireAuth } from "@/utils/cf-access";
import { reviewBroadcastCopy } from "@/utils/compliance-review";
import { log } from "@/utils/logger";

export const dynamic = "force-dynamic";

const MAX_CONTACTS = 500;

const SUBJECT = "Still interested? Let's find a time to chat";
const TEXT_BODY = `Hi,

We've tried reaching you a few times about your enquiry and haven't heard back yet.

If you're still interested, just reply to this email or give us a call to book a time —
we're happy to work around your schedule.

If now's not the right time, no problem at all — just let us know and we'll follow up later.

Thanks,
NextKey Property Strategists`;
const HTML_BODY = TEXT_BODY.split("\n\n")
  .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
  .join("\n");

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const operator = auth;

  let body: { contact_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const contactIds = Array.isArray(body.contact_ids)
    ? Array.from(new Set(body.contact_ids.filter((id): id is string => typeof id === "string" && id.length > 0)))
    : [];

  if (contactIds.length === 0) {
    return NextResponse.json({ ok: false, error: "contact_ids is required" }, { status: 400 });
  }
  if (contactIds.length > MAX_CONTACTS) {
    return NextResponse.json(
      { ok: false, error: `too many contacts selected (${contactIds.length} > ${MAX_CONTACTS})` },
      { status: 400 },
    );
  }

  // The template is fixed, but still runs through the same AU-compliance
  // reviewer as /broadcast — defence in depth if the template is ever edited.
  const { violations } = await reviewBroadcastCopy({
    subject: SUBJECT,
    html_body: HTML_BODY,
    text_body: TEXT_BODY,
  });
  if (violations.length > 0) {
    log.error("opportunities.reengage.template_flagged", { operator, violations });
    return NextResponse.json(
      { ok: false, error: "re-engagement template failed compliance review — contact an admin", violations },
      { status: 500 },
    );
  }

  const { data: seqRow, error: seqErr } = await supabase
    .from("sequences")
    .insert({
      slug: `reengage-${Date.now()}`,
      name: `No-response re-engagement — ${new Date().toISOString()}`,
      description: `Manual re-engagement send to ${contactIds.length} contact(s) with 3+ unanswered SMS attempts, triggered from Opportunities.`,
      channel: "email",
      is_active: false,
    })
    .select("id")
    .single();
  if (seqErr || !seqRow) {
    return NextResponse.json(
      { ok: false, error: `failed to create sequence: ${seqErr?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }
  const sequenceId = seqRow.id as string;

  async function teardown(reason: string) {
    await supabase.from("sequence_enrollments").delete().eq("sequence_id", sequenceId);
    await supabase.from("sequence_steps").delete().eq("sequence_id", sequenceId);
    await supabase.from("sequences").delete().eq("id", sequenceId);
    return NextResponse.json({ ok: false, error: reason }, { status: 500 });
  }

  const { error: stepErr } = await supabase.from("sequence_steps").insert({
    sequence_id: sequenceId,
    position: 1,
    step_type: "send_email",
    delay_hours: 0,
    payload: { subject: SUBJECT, html_body: HTML_BODY, text_body: TEXT_BODY },
  });
  if (stepErr) return await teardown(`failed to insert step: ${stepErr.message}`);

  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const rows = contactIds.slice(i, i + CHUNK).map((cid) => ({
      sequence_id: sequenceId,
      contact_id: cid,
      enrolled_by: "opportunities.reengage",
    }));
    const { error: enrErr } = await supabase.from("sequence_enrollments").insert(rows);
    if (enrErr) return await teardown(`enrolment failed at chunk ${i / CHUNK}: ${enrErr.message}`);
    inserted += rows.length;
  }

  const { error: activateErr } = await supabase
    .from("sequences")
    .update({ is_active: true })
    .eq("id", sequenceId);
  if (activateErr) return await teardown(`failed to activate sequence: ${activateErr.message}`);

  log.info("opportunities.reengage.queued", { operator, sequence_id: sequenceId, enrolled_count: inserted });

  const sendSeconds = Math.ceil(inserted * 0.3);
  const etaMinutes = Math.ceil(5 + sendSeconds / 60);

  return NextResponse.json({ ok: true, sequence_id: sequenceId, enrolled_count: inserted, eta_minutes: etaMinutes });
}
