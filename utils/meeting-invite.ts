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
import { DEFAULT_PRODID, icsBase64 } from "./ics";
import type { Brand } from "./scheduling-hosts";
import { EMAIL_FONT, hostSignature, type SignatureBlock } from "./email-signature";

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
  /**
   * "phone" drops the meeting-invite framing in favour of a callback
   * confirmation — there's no join link to promote, so the copy shouldn't
   * imply one is coming. Defaults to "video" for backward compatibility.
   * Separate from `kind` (invite/update/cancel): a phone call can be updated
   * or cancelled too.
   */
  medium?: "video" | "phone";
  /**
   * Everyone invited, for the .ics ATTENDEE lines — so each recipient's
   * calendar shows the full participant list rather than just themselves.
   * `to` is still the one person THIS email goes to; send once per attendee
   * with the same `uid` so every copy is the same meeting, not three.
   * Defaults to `[to]`.
   */
  attendees?: Array<{ email: string; name?: string }>;
  /**
   * "invite" (default) for a new meeting, "update" when the time or details of
   * an already-sent meeting changed, "cancel" to withdraw it. Update and cancel
   * MUST reuse the original `uid` so the attendee's calendar edits the existing
   * entry instead of adding a second one.
   */
  kind?: "invite" | "update" | "cancel";
  /** .ics SEQUENCE. Must rise on every update/cancel of the same uid. */
  sequence?: number;
  /**
   * The sender's signature. sendMeetingInvite fills it from the host
   * (hostSignature); only pass it to override, e.g. in tests.
   */
  signature?: SignatureBlock;
}

/**
 * Invite colours per brand. NextKey keeps its teal; a Springboard invite goes
 * to Springboard leads, so it uses Springboard navy + amber (brand firewall).
 * Navy carries the heading, button and link (amber text on white is too faint
 * to read); amber is the accent rule under the heading.
 */
const BRAND_COLOURS: Record<Brand, { primary: string; accent: string | null }> = {
  nextkey: { primary: "#0F4C5C", accent: null },
  springboard: { primary: "#020e40", accent: "#c7894e" },
};

/** .ics PRODID per brand — some calendar apps show who produced the file. */
const BRAND_PRODID: Record<Brand, string> = {
  nextkey: DEFAULT_PRODID,
  springboard: "-//Springboard Homes//Meeting//EN",
};

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
  const { primary, accent } = BRAND_COLOURS[opts.host.brand] ?? BRAND_COLOURS.nextkey;
  const accentRule = accent
    ? `<div style="width:56px;height:3px;background:${accent};margin:0 0 12px;"></div>`
    : "";
  const greetingName = opts.to.name ? ` ${escapeHtml(opts.to.name.split(" ")[0])}` : "";
  const kind = opts.kind ?? "invite";
  const lede =
    kind === "cancel" ? "This meeting has been cancelled"
    : kind === "update" ? "This meeting has been updated — the details below replace the earlier invite"
    : opts.medium === "phone" ? "Confirming our call"
    : "You've been invited to a meeting";
  const showJoin = !!opts.joinUrl && opts.kind !== "cancel";
  const joinBtn = showJoin
    ? `<tr><td style="padding:8px 0 20px;">
         <a href="${escapeHtml(opts.joinUrl!)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;font-size:15px;">Join the video meeting</a>
       </td></tr>`
    : "";
  const locationRow = !opts.joinUrl && opts.location
    ? `<tr><td style="padding:2px 0;color:#374151;"><strong>Where:</strong> ${escapeHtml(opts.location)}</td></tr>`
    : "";
  const descRow = opts.description
    ? `<tr><td style="padding:12px 0 0;color:#4b5563;white-space:pre-line;">${escapeHtml(opts.description)}</td></tr>`
    : "";
  const joinFallback = showJoin
    ? `<p style="color:#6b7280;font-size:13px;margin:18px 0 0;">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(opts.joinUrl!)}" style="color:${primary};">${escapeHtml(opts.joinUrl!)}</a></p>`
    : "";

  return `
  <div style="font-family:${EMAIL_FONT};max-width:560px;margin:0 auto;color:#111827;">
    <h2 style="color:${primary};font-size:20px;margin:0 0 4px;">${escapeHtml(opts.title)}</h2>
    ${accentRule}
    <p style="color:#6b7280;margin:0 0 18px;font-size:14px;">${lede}</p>
    <p style="margin:0 0 14px;">Hi${greetingName},</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:15px;">
      <tr><td style="padding:2px 0;color:#374151;"><strong>When:</strong> ${escapeHtml(when)}</td></tr>
      <tr><td style="padding:2px 0 10px;color:#374151;"><strong>With:</strong> ${escapeHtml(opts.host.displayName)}</td></tr>
      ${locationRow}
      ${joinBtn}
      ${descRow}
    </table>
    ${joinFallback}
    ${opts.signature?.html ?? ""}
    <p style="color:#9ca3af;font-size:12px;margin:22px 0 0;border-top:1px solid #e5e7eb;padding-top:12px;">
      ${opts.kind === "cancel"
        ? "A calendar file is attached — open it to remove this meeting from your calendar."
        : "A calendar file is attached — open it to add this meeting to your calendar."}
    </p>
  </div>`.trim();
}

/**
 * Send the meeting invite. Best-effort at the transport layer (returns an
 * envelope, never throws) — the caller decides how a failed send surfaces.
 */
export async function sendMeetingInvite(opts: MeetingInviteOpts): Promise<BrevoSendResult> {
  const sender = BRAND_SENDER[opts.host.brand];
  // Outward-email rule: every email carries its sender's signature. No
  // signature on file → don't send, and say why; the callers already report a
  // failed invite to the person who booked it so they can follow up.
  const signature = opts.signature ?? (await hostSignature(opts.host));
  if (!signature) {
    const who = opts.host.brand === "springboard" ? "Glenn (Springboard invites)" : opts.host.email;
    return {
      ok: false,
      error: `no email signature on file for ${who}. Add one in Settings → Email signature, then resend`,
    };
  }
  const html = meetingInviteHtml({ ...opts, signature });

  const ics = icsBase64({
    uid: opts.uid,
    start: opts.start,
    end: opts.end,
    title: opts.title,
    description: opts.description,
    location: opts.joinUrl ?? opts.location ?? undefined,
    url: opts.joinUrl ?? undefined,
    organizer: { name: opts.host.displayName, email: opts.host.email },
    attendees: (opts.attendees?.length ? opts.attendees : [opts.to]).map((a) => ({
      name: a.name,
      email: a.email,
    })),
    method: opts.kind === "cancel" ? "CANCEL" : "REQUEST",
    sequence: opts.sequence,
    prodId: BRAND_PRODID[opts.host.brand],
  });

  const subject =
    opts.kind === "cancel" ? `Cancelled: ${opts.title}`
    : opts.kind === "update" ? `Updated: ${opts.title}`
    : opts.medium === "phone" ? `Confirming: ${opts.title}`
    : `Invitation: ${opts.title}`;

  return sendBrevoEmail({
    to: [{ email: opts.to.email, name: opts.to.name }],
    subject,
    html,
    fromEmail: sender.email,
    fromName: sender.name,
    // Reply-to the host so a reply reaches the person running the meeting.
    replyTo: opts.host.email,
    tags: [opts.kind && opts.kind !== "invite" ? `crm-meeting-${opts.kind}` : "crm-meeting-invite"],
    attachments: [{ name: "invite.ics", content: ics }],
  });
}
