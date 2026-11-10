/**
 * Map a Brevo send result → an `email_log` outbound row.
 *
 * Every CRM send path (POST /api/emails, mail drafts send, voice send, PIA
 * report email) needs to write an `email_log` row stamped with the RFC822
 * Message-ID of the mail we sent, because the inbound reply feeder
 * (NEXUS elvis_email_inbound.py) threads incoming replies by matching their
 * `In-Reply-To` header against `email_log.message_id`. With no outbound row
 * carrying that id, a reply can never be threaded and never surfaces in the
 * CRM inbox.
 *
 * Brevo's `/v3/smtp/email` response `messageId` IS that RFC822 Message-ID
 * (e.g. `<...@smtp-relay.brevo.com>`) — the exact value a recipient's reply
 * carries in In-Reply-To — so we stamp it into both `message_id` (the
 * threadable key) and `brevo_message_id` (provider audit).
 *
 * This helper is a pure mapping so the id-extraction / column-shape logic is
 * unit-testable without a live Brevo send or a Supabase client.
 */
import type { BrevoSendResult } from "./brevo";

export type OutboundLogInput = {
  to: string;
  toName?: string | null;
  subject: string;
  html: string;
  fromEmail: string;
  fromName: string;
  /** CF-Access authenticated sender email. */
  sentBy?: string | null;
  /** Canonical owner_user_email for inbox routing (resolveSender). */
  ownerUserEmail?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  threadId?: string | null;
  inReplyTo?: string | null;
  tags?: string[];
};

/**
 * Build the row object to insert into `public.email_log`. Column names match
 * the migrations (20260502_email_log.sql + 20260502_email_inbound.sql) and the
 * existing outbound inserts in POST /api/emails.
 *
 * A successful send with a falsy/empty messageId is treated as "sent but not
 * threadable": status stays 'sent' but message_id is null (an empty string
 * could never match a reply's In-Reply-To, and null makes that explicit).
 * Callers should surface a warning in that case.
 */
export function outboundEmailLogRow(
  input: OutboundLogInput,
  result: BrevoSendResult,
): Record<string, unknown> {
  const messageId = result.ok && result.messageId ? result.messageId : null;
  return {
    contact_id: input.contactId ?? null,
    opportunity_id: input.opportunityId ?? null,
    direction: "outbound",
    to_email: input.to,
    to_name: input.toName ?? null,
    from_email: input.fromEmail,
    from_name: input.fromName,
    subject: input.subject,
    body_html: input.html,
    status: result.ok ? "sent" : "failed",
    brevo_message_id: messageId,
    message_id: messageId,
    error: result.ok ? null : result.error,
    sent_by: input.sentBy ?? null,
    owner_user_email: input.ownerUserEmail ?? null,
    // Outbound mail is "read" by definition — the sender saw it before sending.
    is_read: true,
    tags: input.tags ?? [],
    thread_id: input.threadId ?? null,
    in_reply_to: input.inReplyTo ?? null,
    sent_at: result.ok ? new Date().toISOString() : null,
  };
}
