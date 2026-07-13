/**
 * Brevo (formerly Sendinblue) transactional email helper.
 *
 * Uses the v3 SMTP API: POST https://api.brevo.com/v3/smtp/email
 * Server-only — reads BREVO_API_KEY + BREVO_SENDER_EMAIL from process.env.
 *
 * Mirrors the pattern in utils/sms.ts (envelope return type so route handlers
 * stay flat).
 */

const BREVO_BASE = "https://api.brevo.com/v3";

export type BrevoSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

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
  /** Attachments — Brevo fetches each `url` during send so it must be
   * publicly reachable for ~30 seconds. Signed Supabase Storage URLs work.
   * Per-attachment 10MB limit when sent as URL per Brevo's docs. */
  attachments?: { name: string; url: string }[];
  /** Optional sending-identity override for the `from` envelope. When omitted,
   * the BREVO_SENDER_EMAIL / BREVO_SENDER_NAME env defaults are used, so
   * existing callers are unaffected. Must be a verified Brevo sender. */
  fromEmail?: string;
  fromName?: string;
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
        to: opts.to,
        subject: opts.subject,
        htmlContent: opts.html,
        textContent: text,
        replyTo: opts.replyTo ? { email: opts.replyTo } : undefined,
        tags: opts.tags,
        headers: opts.headers && Object.keys(opts.headers).length > 0 ? opts.headers : undefined,
        attachment: opts.attachments && opts.attachments.length > 0
          ? opts.attachments.map((a) => ({ name: a.name, url: a.url }))
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
