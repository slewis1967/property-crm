/**
 * GET  /api/emails?contact_id=&opportunity_id=&limit=
 *   List emails filtered by contact or opportunity. Newest first.
 *
 * POST /api/emails
 *   Body: { to, to_name?, subject, body_html, body_text?, cc?, bcc?,
 *           contact_id?, opportunity_id?, tags? }
 *   Sends via Brevo, logs the row, returns the saved row.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { sendBrevoEmail } from "../../../utils/brevo";
import { defaultSignature } from "../../../utils/email-signature";

export const dynamic = "force-dynamic";

const SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL ?? "info@nextkey.com.au";
const SENDER_NAME = process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  const opportunityId = url.searchParams.get("opportunity_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);

  let q = supabase
    .from("email_log")
    .select("id,direction,to_email,to_name,from_email,from_name,subject,body_html,status,error,sent_by,sent_at,created_at,tags,message_id,in_reply_to,thread_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (contactId) q = q.eq("contact_id", contactId);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, emails: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const {
    to, to_name, subject, body_html, body_text,
    cc, bcc, contact_id, opportunity_id, tags,
    in_reply_to, thread_id,
  } = body;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Valid 'to' email required" }, { status: 400 });
  }
  if (!subject || typeof subject !== "string") {
    return NextResponse.json({ ok: false, error: "subject required" }, { status: 400 });
  }
  if (!body_html || typeof body_html !== "string") {
    return NextResponse.json({ ok: false, error: "body_html required" }, { status: 400 });
  }

  const sentBy =
    req.headers.get("x-user-email") ??
    req.headers.get("cf-access-authenticated-user-email") ??
    null;

  // Append the standard signature. Stored on the row exactly as sent so
  // the audit trail and recipient see the same body. Caller can opt out by
  // passing `skip_signature: true` (e.g. for system notifications that
  // shouldn't carry Sean's personal sig).
  const sig = defaultSignature();
  const skipSig = body.skip_signature === true;
  const finalHtml = skipSig ? body_html : `${body_html}${sig.html}`;
  const finalText = skipSig
    ? (body_text ?? null)
    : `${body_text ?? ""}${sig.text}`;

  // 1. Insert as queued so we have an audit row even if Brevo errors.
  const { data: row, error: insertErr } = await supabase
    .from("email_log")
    .insert({
      contact_id: contact_id ?? null,
      opportunity_id: opportunity_id ?? null,
      direction: "outbound",
      to_email: to,
      to_name: to_name ?? null,
      from_email: SENDER_EMAIL,
      from_name: SENDER_NAME,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      subject,
      body_html: finalHtml,
      body_text: finalText,
      status: "queued",
      sent_by: sentBy,
      tags: Array.isArray(tags) ? tags : [],
      in_reply_to: in_reply_to ?? null,
      thread_id: thread_id ?? null,
    })
    .select("*")
    .single();

  if (insertErr || !row) {
    return NextResponse.json({ ok: false, error: insertErr?.message ?? "Insert failed" }, { status: 500 });
  }

  // 2. Send via Brevo.
  // Set RFC822 In-Reply-To and References when this is a reply, so the
  // recipient's mail client threads it under the original conversation.
  const replyHeaders: Record<string, string> = {};
  if (in_reply_to) {
    replyHeaders["In-Reply-To"] = in_reply_to;
    replyHeaders["References"] = in_reply_to;
  }
  const result = await sendBrevoEmail({
    to: [{ email: to, name: to_name ?? undefined }],
    subject,
    html: finalHtml,
    text: finalText ?? undefined,
    tags: ["crm-outbound", ...(Array.isArray(tags) ? tags : [])],
    headers: replyHeaders,
  });

  // 3. Update row with outcome. Brevo's `messageId` IS the RFC822 Message-ID
  // (e.g. <abc@smtp-relay.brevo.com>), so populate both columns. message_id
  // is what the inbound poller threads against when replies come in.
  const update: Record<string, unknown> = result.ok
    ? {
        status: "sent",
        brevo_message_id: result.messageId,
        message_id: result.messageId,
        sent_at: new Date().toISOString(),
      }
    : { status: "failed", error: result.error };

  const { data: updated, error: updateErr } = await supabase
    .from("email_log")
    .update(update)
    .eq("id", row.id)
    .select("*")
    .single();

  if (updateErr) {
    return NextResponse.json(
      { ok: false, error: `Sent but failed to update audit row: ${updateErr.message}`, email: row },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, email: updated }, { status: 502 });
  }
  return NextResponse.json({ ok: true, email: updated });
}
