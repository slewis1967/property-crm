/**
 * Meeting-invite email (server-side only).
 *
 * This is what replaced Google Calendar in the CRM meeting flow. When a meeting
 * is scheduled from the CRM we send the attendee a branded Brevo email with:
 *   - the date/time + host,
 *   - a one-click LiveKit "join the video meeting" button (our own SFU), and
 *   - an .ics attachment so the meeting drops into whatever calendar they use
 *     (Outlook / Apple / Proton / phone) — no Google account anywhere.
 *
 * Sender identity is brand-aware so the invite comes from the right address:
 * NextKey meetings from the NextKey sender, Springboard meetings from the
 * Springboard sender (both Brevo-validated — see CLAUDE.md EMAIL SENDERS).
 */
import { sendBrevoEmail, type BrevoSendResult } from "./brevo";
import { icsBase64 } from "./ics";
import type { Brand } from "./scheduling-hosts";

/** Validated Brevo senders per brand (mirrors utils/signatures + brevo.ts). */
const BRAND_SENDER: Record<Brand, { email: string; name: string }> = {
  nextkey: {
    email: process.env.BREVO_SENDER_EMAIL ?? "sean.l@nextkey.com.au",
    name: process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists",
  },
  springboard: {
    email: "hello@springboardhomes.com.au",
    name: "Springboard Homes",
  },
};

export interface MeetingInviteOpts {
  to: { email: string; name?: string };
  host: { email: string; displayName: string; brand: Brand };
  title: string;
  description?: string;
  /** ISO datetimes (any offset). */
  start: string;
  end: string;
  /** LiveKit join link, if video is configured for this meeting. */
  joinUrl?: string | null;
  /** Physical location, when it's not a video meeting. */
  location?: string | null;
  /** Stable id for the .ics event (reuse to update/cancel later). */
  uid: string;
  /** IANA tz used to render the human-readable time. Defaults AU/Brisbane. */
  tz?: string;
}

const BRAND_TEAL = "#0F4C5C";

function fmtRange(start: string, end: string, tz: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const day = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz,
  }).format(s);
  const t = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);
  const tzAbbr = new Intl.DateTimeFormat("en-AU", { timeZoneName: "short", timeZone: tz })
    .formatToParts(s).find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${day}, ${t(s)} – ${t(e)}${tzAbbr ? ` (${tzAbbr})` : ""}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the invite HTML body (also used as the source for the text fallback). */
export function meetingInviteHtml(opts: MeetingInviteOpts): string {
  const tz = opts.tz ?? "Australia/Brisbane";
  const when = fmtRange(opts.start, opts.end, tz);
  const greetingName = opts.to.name ? ` ${escapeHtml(opts.to.name.split(" ")[0])}` : "";
  const joinBtn = opts.joinUrl
    ? `<tr><td style="padding:8px 0 20px;">
         <a href="${escapeHtml(opts.joinUrl)}" style="display:inline-block;background:${BRAND_TEAL};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;font-size:15px;">Join the video meeting</a>
       </td></tr>`
    : "";
  const locationRow = !opts.joinUrl && opts.location
    ? `<tr><td style="padding:2px 0;color:#374151;"><strong>Where:</strong> ${escapeHtml(opts.location)}</td></tr>`
    : "";
  const descRow = opts.description
    ? `<tr><td style="padding:12px 0 0;color:#4b5563;white-space:pre-line;">${escapeHtml(opts.description)}</td></tr>`
    : "";
  const joinFallback = opts.joinUrl
    ? `<p style="color:#6b7280;font-size:13px;margin:18px 0 0;">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(opts.joinUrl)}" style="color:${BRAND_TEAL};">${escapeHtml(opts.joinUrl)}</a></p>`
    : "";

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111827;">
    <h2 style="color:${BRAND_TEAL};font-size:20px;margin:0 0 4px;">${escapeHtml(opts.title)}</h2>
    <p style="color:#6b7280;margin:0 0 18px;font-size:14px;">You've been invited to a meeting</p>
    <p style="margin:0 0 14px;">Hi${greetingName},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;">
      <tr><td style="padding:2px 0;color:#374151;"><strong>When:</strong> ${escapeHtml(when)}</td></tr>
      <tr><td style="padding:2px 0 10px;color:#374151;"><strong>With:</strong> ${escapeHtml(opts.host.displayName)}</td></tr>
      ${locationRow}
      ${joinBtn}
      ${descRow}
    </table>
    ${joinFallback}
    <p style="color:#9ca3af;font-size:12px;margin:22px 0 0;border-top:1px solid #e5e7eb;padding-top:12px;">
      A calendar file is attached — open it to add this meeting to your calendar.
    </p>
  </div>`.trim();
}

/**
 * Send the meeting invite. Best-effort at the transport layer (returns an
 * envelope, never throws) — the caller decides how a failed send surfaces.
 */
export async function sendMeetingInvite(opts: MeetingInviteOpts): Promise<BrevoSendResult> {
  const sender = BRAND_SENDER[opts.host.brand];
  const html = meetingInviteHtml(opts);

  const ics = icsBase64({
    uid: opts.uid,
    start: opts.start,
    end: opts.end,
    title: opts.title,
    description: opts.description,
    location: opts.joinUrl ?? opts.location ?? undefined,
    url: opts.joinUrl ?? undefined,
    organizer: { name: opts.host.displayName, email: opts.host.email },
    attendees: [{ name: opts.to.name, email: opts.to.email }],
    method: "REQUEST",
  });

  return sendBrevoEmail({
    to: [{ email: opts.to.email, name: opts.to.name }],
    subject: `Invitation: ${opts.title}`,
    html,
    fromEmail: sender.email,
    fromName: sender.name,
    // Reply-to the host so a reply reaches the person running the meeting.
    replyTo: opts.host.email,
    tags: ["crm-meeting-invite"],
    attachments: [{ name: "invite.ics", content: ics }],
  });
}
