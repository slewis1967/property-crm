/**
 * Brevo (formerly Sendinblue) transactional email helper.
 *
 * Uses the v3 SMTP API: POST https://api.brevo.com/v3/smtp/email
 * Server-only — reads BREVO_API_KEY + BREVO_SENDER_EMAIL from process.env.
 *
 * Mirrors the pattern in utils/sms.ts (envelope return type so route handlers
 * stay flat).
 */

import { supabase } from "./supabase";

const BREVO_BASE = "https://api.brevo.com/v3";

export type BrevoSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Which of these emails have opted out of commercial email? Matches the
 * broadcast audience filter (`unsubscribes` table, channel ∈ {email, all}),
 * so a contact who unsubscribes is suppressed identically whether they're hit
 * by a bulk broadcast or a 1:1 commercial send. Returns a lower-cased Set.
 *
 * Fail-OPEN on a query error (returns empty) is deliberate: a transient
 * Supabase outage must not silently swallow a legitimate send. The bulk
 * broadcast path and the NEXUS runner both re-check, so this is one of several
 * suppression points, not the only one.
 */
export async function unsubscribedEmails(emails: string[]): Promise<Set<string>> {
  const lowered = emails.map((e) => e.toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return new Set();
  const { data, error } = await supabase
    .from("unsubscribes")
    .select("email")
    .in("channel", ["email", "all"])
    .in("email", lowered);
  if (error || !data) return new Set();
  return new Set(
    (data as { email: string | null }[])
      .map((u) => u.email?.toLowerCase())
      .filter((e): e is string => !!e),
  );
}

export type BrevoSendOptions = {
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  /** Plain-text fallback. If omitted, a stripped-HTML version is generated. */
  text?: string;
  /** Optional reply-to override (otherwise BREVO_SENDER_EMAIL). */
  replyTo?: string;
  tags?: string[];
  /** Custom RFC822 headers — used to set In-Reply-To and References on
   * replies so recipient mail clients thread the conversation correctly. */
  headers?: Record<string, string>;
  /** Attachments. Two shapes, matching Brevo's two accepted forms:
   *   - `{ name, url }`  — Brevo fetches the URL at send time, so it must be
   *     publicly reachable for ~30s (signed Supabase Storage URLs work).
   *   - `{ name, content }` — base64-encoded bytes sent inline; no hosting
   *     needed. Used for the meeting-invite .ics, which is generated on the fly.
   * Per-attachment 10MB limit per Brevo's docs. */
  attachments?: ({ name: string; url: string } | { name: string; content: string })[];
  /** Optional sending-identity override for the `from` envelope. When omitted,
   * the BREVO_SENDER_EMAIL / BREVO_SENDER_NAME env defaults are used, so
   * existing callers are unaffected. Must be a verified Brevo sender. */
  fromEmail?: string;
  fromName?: string;
  /** Set true for commercial/marketing email (advisory reports, nudges,
   * outreach). Recipients on the `unsubscribes` list are then suppressed —
   * the Spam Act requires opt-out to be honoured across the business, not
   * just on the bulk broadcast path. Leave false/unset for genuinely
   * transactional or legal mail (e-signature requests, meeting invites,
   * booking confirmations, broker/YLA submissions) where an unsubscribe from
   * marketing must NOT block the message. */
  commercial?: boolean;
};

export async function sendBrevoEmail(opts: BrevoSendOptions): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY;
  // A per-send identity override wins over the env default. Falls back to the
  // NextKey env sender when not supplied. The hardcoded fallback is a
  // Brevo-validated address so mail delivers even if BREVO_SENDER_EMAIL is unset.
  // NOTE: hello@nextkey.com.au is not yet a validated Brevo sender — revert this
  // default to hello@nextkey.com.au once it's validated/domain-authenticated.
  const senderEmail = opts.fromEmail ?? process.env.BREVO_SENDER_EMAIL ?? "sean.l@nextkey.com.au";
  const senderName = opts.fromName ?? process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists";

  if (!apiKey) {
    return { ok: false, error: "BREVO_API_KEY missing — email feature disabled" };
  }
  if (!opts.to?.length) {
    return { ok: false, error: "No recipients" };
  }
  if (!opts.subject || !opts.html) {
    return { ok: false, error: "subject and html are required" };
  }

  // Commercial email: drop any recipient who has opted out (Spam Act). Non-
  // commercial (transactional/legal) sends skip this so an unsubscribe can't
  // block e.g. an e-signature request or a meeting invite the person needs.
  let recipients = opts.to;
  if (opts.commercial) {
    const suppressed = await unsubscribedEmails(recipients.map((r) => r.email));
    if (suppressed.size > 0) {
      recipients = recipients.filter((r) => !suppressed.has(r.email.toLowerCase()));
      if (recipients.length === 0) {
        return { ok: false, error: "All recipients have unsubscribed" };
      }
    }
  }

  const text = opts.text ?? stripHtml(opts.html);

  // Never throw: any transport-level failure (fetch rejection, DNS, timeout) is
  // returned as { ok:false } just like a non-2xx Brevo response, so callers can
  // rely on the envelope alone to detect a failed send. Existing callers that
  // only check `.ok` are unaffected.
  let res: Response;
  try {
    res = await fetch(`${BREVO_BASE}/smtp/email`, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: recipients,
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: text,
        replyTo: opts.replyTo ? { email: opts.replyTo } : undefined,
        tags: opts.tags,
        headers: opts.headers && Object.keys(opts.headers).length > 0 ? opts.headers : undefined,
        attachment: opts.attachments && opts.attachments.length > 0
          ? opts.attachments.map((a) =>
              "url" in a ? { name: a.name, url: a.url } : { name: a.name, content: a.content },
            )
          : undefined,
      }),
    });
  } catch (e) {
    return { ok: false, error: `Brevo request failed: ${e instanceof Error ? e.message : String(e)}` };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Brevo ${res.status}: ${body.slice(0, 300)}` };
  }
  const json = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { ok: true, messageId: json.messageId ?? "" };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
