/**
 * POST /api/mail/drafts/{id}/send
 *
 * Convert a draft to an outbound send: read the draft, fire it through the
 * existing email-send code path (Brevo + audit log + signature append), and
 * delete the draft row on success. On failure the draft survives so the
 * user can retry — the underlying email_log row is still created in
 * 'failed' status by the send path.
 *
 * To/Cc/Bcc semantics: the existing POST /api/emails accepts a single `to`
 * and an array of `cc`/`bcc`. Drafts can have multiple `to_addresses`; if a
 * draft has more than one primary recipient, fire one send per primary so
 * each one gets a separate audit row (same body, different `to`).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { sendBrevoEmail } from "../../../../../../utils/brevo";
import { resolveSender } from "../../../../../../utils/mail-owner";
import { resolveIdentity } from "../../../../../../utils/mailIdentities";
import { userEmailFromRequest } from "../../../../../../utils/cf-access";
import { alertOps } from "../../../../../../utils/alert";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owner = await userEmailFromRequest(req);

  const { data: draft, error: loadErr } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("id", id)
    .eq("owner_user_email", owner)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  if (!draft) return NextResponse.json({ ok: false, error: "Draft not found" }, { status: 404 });

  const tos: string[] = Array.isArray(draft.to_addresses) ? draft.to_addresses : [];
  const ccs: string[] = Array.isArray(draft.cc_addresses) ? draft.cc_addresses : [];
  const bccs: string[] = Array.isArray(draft.bcc_addresses) ? draft.bcc_addresses : [];

  if (tos.length === 0) {
    return NextResponse.json({ ok: false, error: "Draft has no To recipients" }, { status: 400 });
  }
  if (!draft.subject || !draft.subject.trim()) {
    return NextResponse.json({ ok: false, error: "Draft is missing a subject" }, { status: 400 });
  }
  if (!draft.body_html || !draft.body_html.trim()) {
    return NextResponse.json({ ok: false, error: "Draft body is empty" }, { status: 400 });
  }

  // The composer pre-populates the signature into the draft body so the
  // user can type above it (Gmail-style WYSIWYG). The body is therefore
  // the source of truth — do NOT re-append at send time or we'd ship two
  // signatures. Old drafts created before this slice may still lack a
  // signature; treat the missing-signature case as user choice rather than
  // try to detect + retrofit.
  const finalHtml = draft.body_html;
  const ownerEmail = await resolveSender(owner);

  // Resolve the draft's chosen sending identity → from envelope. Absent/unknown
  // (e.g. drafts created before the from_identity column) falls back to nextkey,
  // preserving the historical behaviour.
  const identity = resolveIdentity(draft.from_identity);
  const senderEmail = identity.fromEmail;
  const senderName = identity.fromName;

  // Resolve attachments + sign download URLs once. Brevo fetches each URL
  // during send; the signed URL lifespan only needs to cover the seconds
  // between this request and Brevo's pull. 1h TTL covers retries + slow
  // pipelines without being so long it's a meaningful leak surface.
  const { data: attachmentRows } = await supabase
    .from("email_attachments")
    .select("id,filename,storage_path")
    .eq("email_id", id)
    .eq("email_kind", "draft");

  const brevoAttachments: { name: string; url: string }[] = [];
  for (const a of attachmentRows ?? []) {
    const { data: signed } = await supabase.storage
      .from("mail-attachments")
      .createSignedUrl(a.storage_path, 60 * 60);
    if (signed?.signedUrl) {
      brevoAttachments.push({ name: a.filename, url: signed.signedUrl });
    }
  }

  const replyHeaders: Record<string, string> = {};
  if (draft.reply_to_email_id) {
    // The draft was a reply; look up the parent's message_id to populate
    // In-Reply-To/References for proper threading in recipients' clients.
    const { data: parent } = await supabase
      .from("email_log")
      .select("message_id")
      .eq("id", draft.reply_to_email_id)
      .maybeSingle();
    if (parent?.message_id) {
      replyHeaders["In-Reply-To"] = parent.message_id;
      replyHeaders["References"] = parent.message_id;
    }
  }

  const sentIds: string[] = [];
  const failures: Array<{ to: string; error: string }> = [];

  for (const to of tos) {
    // Insert audit row first so we have something even if Brevo errors.
    const { data: row, error: insertErr } = await supabase
      .from("email_log")
      .insert({
        direction: "outbound",
        to_email: to,
        from_email: senderEmail,
        from_name: senderName,
        cc: ccs,
        bcc: bccs,
        subject: draft.subject,
        body_html: finalHtml,
        body_text: null,
        status: "queued",
        sent_by: owner,
        owner_user_email: ownerEmail,
        is_read: true,
        tags: ["draft-send"],
        thread_id: draft.thread_id ?? null,
        in_reply_to: replyHeaders["In-Reply-To"] ?? null,
      })
      .select("id")
      .single();

    if (insertErr || !row) {
      failures.push({ to, error: insertErr?.message ?? "Insert failed" });
      continue;
    }

    const result = await sendBrevoEmail({
      to: [{ email: to }],
      subject: draft.subject,
      html: finalHtml,
      tags: ["crm-outbound", "draft-send"],
      headers: replyHeaders,
      attachments: brevoAttachments.length > 0 ? brevoAttachments : undefined,
      fromEmail: senderEmail,
      fromName: senderName,
    });

    const updatePatch = result.ok
      ? {
          status: "sent",
          brevo_message_id: result.messageId,
          message_id: result.messageId,
          sent_at: new Date().toISOString(),
        }
      : { status: "failed", error: result.error };

    await supabase.from("email_log").update(updatePatch).eq("id", row.id);

    if (result.ok) {
      sentIds.push(row.id);
      // Clone the draft's attachment rows onto this email_log row so each
      // recipient gets a faithful audit trail. The Storage object is shared
      // (path stays the same) — multi-recipient sends don't double the
      // storage cost.
      if (attachmentRows && attachmentRows.length > 0) {
        await supabase.from("email_attachments").insert(
          attachmentRows.map((a) => ({
            email_id: row.id,
            email_kind: "outbound",
            filename: a.filename,
            storage_path: a.storage_path,
          })),
        );
      }
    } else {
      failures.push({ to, error: result.error ?? "Brevo send failed" });
    }
  }

  // Discard the draft only if at least one send succeeded — partial failures
  // keep the draft around for the user to retry the failing recipients.
  // Delete the draft's attachment rows alongside the draft itself; the
  // storage objects stay because the cloned outbound rows still reference
  // them (path-based, no FK).
  if (sentIds.length > 0 && failures.length === 0) {
    await supabase
      .from("email_attachments")
      .delete()
      .eq("email_id", id)
      .eq("email_kind", "draft");
    await supabase.from("email_drafts").delete().eq("id", id).eq("owner_user_email", owner);
  }

  if (failures.length > 0) {
    // Genuine outbound-send failure: one or more recipients bounced off Brevo
    // (or the audit insert failed). Escalate (deduped by this route).
    await alertOps({
      event: "mail_draft.send_failed",
      message: `Draft send had ${failures.length} failed recipient(s)`,
      context: {
        draft_id: id,
        owner,
        sent: sentIds.length,
        failures: failures.map((f) => `${f.to}: ${f.error}`),
      },
      discriminator: "mail/drafts/send",
    });
    return NextResponse.json(
      { ok: false, sent: sentIds, failures, error: failures.map((f) => `${f.to}: ${f.error}`).join("; ") },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, sent: sentIds });
}
