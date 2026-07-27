/**
 * Builds the YLA submission — a calendar invite (.ics) emailed to YLA that
 * drops the entry straight into their calendar, matching their manual weekly
 * process (title "COMP-8317 - NEXTKEY- New Leads Weekly", body = SURNAME +
 * Google Drive link, attendee programs@yourloanassist.com.au). Per Sean's
 * decision the CRM can't create Google Calendar events directly (no API), so an
 * emailed .ics invite is the faithful equivalent — see yla-submission-automation.
 *
 * Pure: given the application facts it returns the email + .ics. The send + the
 * verification gate live in the submit route.
 */
import { buildIcs, icsBase64, type IcsEvent } from "./ics";
import { springboardSenderEmail, springboardSenderName } from "./springboard-sender";

export const YLA_CALENDAR_TITLE = "COMP-8317 - NEXTKEY- New Leads Weekly";
export const YLA_BODY_HEADER = "Add New Leads Below - INCLUDE Google Drive Link - as per example";
export const YLA_INVITE_EMAIL = "programs@yourloanassist.com.au";

export function surnameOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "").toUpperCase();
}

/**
 * The upcoming Thursday (YLA's assessment day) at 02:00 UTC — safely inside
 * Thursday in Australia/Sydney for both AEST and AEDT, so no DST math. The exact
 * time is immaterial; YLA key off the day + the Drive link.
 */
export function nextThursday(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0));
  const THU = 4;
  let add = (THU - d.getUTCDay() + 7) % 7;
  if (add === 0 && now.getTime() >= d.getTime()) add = 7; // today's slot has passed
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

export type YlaInvite = {
  to: string;
  subject: string;
  html: string;
  text: string;
  icsBase64: string;
  ics: string;
  eventStart: Date;
  bodyLine: string;
};

export function buildYlaInvite(args: {
  primaryApplicant: string;
  driveUrl: string;
  clientRef: string | null;
  applicationId: string | null;
  requestId: string;
  now: Date;
  /** Bump per re-send of the same application so calendars accept the update. */
  sequence?: number;
}): YlaInvite {
  const surname = surnameOf(args.primaryApplicant) || args.primaryApplicant;
  const bodyLine = `${surname} - ${args.driveUrl} -`;
  const description = `${YLA_BODY_HEADER}\n${bodyLine}`;
  const start = nextThursday(args.now);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  // A UID should belong to a domain the organiser controls, and the organiser
  // is Springboard. Nothing has been sent under the old NextKey UID, so there
  // is no calendar entry anywhere to orphan by changing it.
  const uid = `yla-${args.clientRef || args.applicationId || args.requestId}@springboardhomes.com.au`;

  const ev: IcsEvent = {
    uid,
    start,
    end,
    title: YLA_CALENDAR_TITLE,
    description,
    // Springboard, not NextKey: this is Springboard's client and Springboard's
    // relationship with the Licensor. The organiser is what YLA see in their
    // calendar once they accept, so it has to match the address the invite
    // arrives from — a NextKey organiser on a Springboard email reads as a
    // forwarded invite from a third party.
    organizer: { name: springboardSenderName(), email: springboardSenderEmail() },
    attendees: [{ email: YLA_INVITE_EMAIL, name: "Your Loan Assist" }],
    sequence: args.sequence ?? 0,
  };

  const ics = buildIcs(ev);
  const refLabel = args.clientRef ? ` (${args.clientRef})` : "";
  const subject = `${YLA_CALENDAR_TITLE} — ${surname}${refLabel}`;
  const text = [
    `New lead documents are ready for assessment.`,
    ``,
    bodyLine,
    ``,
    `A calendar invite is attached (${YLA_CALENDAR_TITLE}).`,
  ].join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px">
    <p>New lead documents are ready for assessment.</p>
    <p style="font-weight:bold">${escapeHtml(surname)}${refLabel} — <a href="${args.driveUrl}">Google Drive folder</a></p>
    <p style="font-size:13px;color:#555">A calendar invite is attached (${escapeHtml(YLA_CALENDAR_TITLE)}). The Drive folder contains the applicant's Preliminary Assessment documents.</p>
  </div>`;

  return { to: YLA_INVITE_EMAIL, subject, html, text, ics, icsBase64: icsBase64(ev), eventStart: start, bodyLine };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
