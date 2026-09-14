/**
 * Property shortlist emails. NextKey-branded (Sean, 2026-09-14) — navy #1b1f44 /
 * amber #da9845, the public logo NEXTKEY_BRANDING already uses — and never a
 * supplier name: the client email says how many properties and where, nothing
 * that identifies a builder or estate.
 */
import { NEXTKEY_BRANDING } from "./partner";

const NAVY = NEXTKEY_BRANDING.primaryColor;
const AMBER = NEXTKEY_BRANDING.accentColor;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function shell(inner: string): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <div style="background:${NAVY};padding:16px 22px;border-radius:8px 8px 0 0;border-bottom:4px solid ${AMBER}">
      <div style="font-size:18px;font-weight:bold;color:#fff">Next<span style="color:${AMBER}">Key</span> <span style="font-weight:normal;font-size:13px;color:#cfd2e6">Property Strategists</span></div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 8px 8px">
      ${inner}
    </div>
  </div>`;
}

/** The client's invitation. `message` is the consultant's own note, escaped. */
export function shortlistInviteHtml(opts: {
  firstName: string;
  link: string;
  count: number;
  suburbs: string[];
  message: string | null;
  consultantName: string | null;
}): string {
  const greeting = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : "Hello,";
  const what = opts.count === 1 ? "a property" : `${opts.count} properties`;
  const where = opts.suburbs.length ? ` in ${escapeHtml(opts.suburbs.slice(0, 4).join(", "))}` : "";
  const note = opts.message
    ? `<div style="margin:0 0 18px;padding:12px 14px;background:#f7f7fb;border-left:3px solid ${AMBER};white-space:pre-wrap">${escapeHtml(opts.message)}</div>`
    : "";
  const sign = opts.consultantName ? escapeHtml(opts.consultantName) : "The NextKey team";
  return shell(`
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">We've put together ${what}${where} for you to look at, with a side-by-side comparison, estimated rent and cashflow, stamp duty and upfront costs, and a profile of each suburb.</p>
      ${note}
      <p style="margin:0 0 24px">
        <a href="${opts.link}" style="display:inline-block;background:${AMBER};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">
          View my properties
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(opts.link)}</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555">This link is private to you. You can tell us which ones you like right on the page, or book a time to talk them through.</p>
      <p style="margin:0;font-size:13px;color:#555">${sign}<br/>NextKey Property Strategists</p>`);
}

/** Internal heads-up when a client responds. Staff-facing, so it may name the lot ref. */
export function shortlistResponseNoticeHtml(opts: {
  clientName: string;
  lotLabel: string;
  lotRef: string;
  response: "interested" | "not_for_me" | null;
  note: string | null;
  staffLink: string;
}): string {
  const verdict =
    opts.response === "interested"
      ? `<strong style="color:#047857">is interested in</strong>`
      : opts.response === "not_for_me"
        ? `<strong style="color:#b91c1c">passed on</strong>`
        : "cleared their response to";
  const note = opts.note
    ? `<div style="margin:12px 0;padding:10px 12px;background:#f7f7fb;border-left:3px solid ${AMBER};white-space:pre-wrap">${escapeHtml(opts.note)}</div>`
    : "";
  return shell(`
      <p style="margin:0 0 12px">${escapeHtml(opts.clientName)} ${verdict} ${escapeHtml(opts.lotLabel)} <span style="color:#666">(${escapeHtml(opts.lotRef)})</span>.</p>
      ${note}
      <p style="margin:16px 0 0"><a href="${opts.staffLink}" style="color:${NAVY};font-weight:bold">Open in the CRM</a></p>`);
}
