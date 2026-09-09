/**
 * Render the Referral Consent and Privacy Form to standalone, print-ready HTML.
 *
 * Plain string templating rather than a React print component, matching
 * introducerAgreementPdf: this is static prose with a handful of merge fields
 * and a signature block per person, so a component would pull in the app graph
 * and buy nothing. Everything is inline-styled because the headless browser that
 * turns this into a PDF never loads the app stylesheet.
 *
 * Springboard navy #020e40 / amber #c7894e, matching every other client-facing
 * Springboard surface.
 *
 * THE CONSENT WORDING COMES FROM THE DOCUMENT, NOT FROM THE CONSTANT. `data`
 * carries the statement that was in force when the form was issued. Rendering
 * today's constant instead would silently restate what a client agreed to — see
 * the header of utils/introducer-consent.ts.
 */

import type { SignatureMark } from "../signatures";
import type { ConsentDocData } from "../introducer-consent";

const NAVY = "#020e40";
const AMBER = "#c7894e";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

/** A blank we could not fill. Visible on purpose — a silent gap gets signed. */
const field = (v: string): string =>
  v.trim()
    ? esc(v)
    : `<span style="background:#fff3cd;color:#8a6d3b;padding:0 4px;">[not supplied]</span>`;

/** "20 August 2026" from an ISO date, or "" when there isn't one. */
function day(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  });
}

/**
 * One signature block per person.
 *
 * Each applicant signs for themselves, and the block says whose consent it is —
 * a page with two anonymous ruled lines cannot show that the second applicant
 * consented to anything.
 */
function signatureBlock(
  signerName: string,
  sig: SignatureMark | null | undefined,
  index: number,
): string {
  const image = sig?.image
    ? `<img src="${esc(sig.image)}" alt="" style="height:52px;display:block;" />`
    : `<div style="height:52px;"></div>`;
  return `
    <div style="margin-top:26px;padding-top:14px;border-top:2px solid ${NAVY};">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:10px;">
        Signed by applicant ${index + 1}
      </div>
      ${image}
      <div style="border-top:1px solid #9ca3af;width:300px;margin-top:4px;padding-top:5px;font-size:13px;">
        <strong>${field(sig?.name || signerName)}</strong><br />
        <span style="color:#6b7280;">Date: ${sig?.date ? esc(sig.date) : "&nbsp;"}</span>
      </div>
    </div>`;
}

export async function renderReferralConsentHtml(
  data: ConsentDocData,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  const sigs = signatures ?? [];
  const title = "Referral Consent and Privacy Form";

  const whoRows = data.signers
    .map(
      (s, i) => `
      <tr>
        <td style="padding:4px 10px 4px 0;color:#6b7280;white-space:nowrap;">Applicant ${i + 1}</td>
        <td style="padding:4px 0;">${field(s.name)}${
          s.email ? ` &middot; <span style="color:#6b7280;">${esc(s.email)}</span>` : ""
        }</td>
      </tr>`,
    )
    .join("");

  const where = [data.client.suburb, data.client.state, data.client.postcode]
    .filter(Boolean)
    .join(" ");

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${esc(title)}</title></head>
<body style="margin:0;padding:34px 40px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430;font-size:13.5px;line-height:1.62;">

  <div style="border-bottom:3px solid ${AMBER};padding-bottom:12px;margin-bottom:20px;">
    <div style="font-size:19px;font-weight:700;color:${NAVY};">Springboard Homes</div>
    <div style="font-size:15px;color:${AMBER};margin-top:2px;">${esc(title)}</div>
  </div>

  <table style="border-collapse:collapse;font-size:13px;margin-bottom:18px;">
    ${whoRows}
    ${where ? `<tr><td style="padding:4px 10px 4px 0;color:#6b7280;">Location</td><td style="padding:4px 0;">${esc(where)}</td></tr>` : ""}
    <tr><td style="padding:4px 10px 4px 0;color:#6b7280;">Referred by</td><td style="padding:4px 0;">${field(data.firm_name)}</td></tr>
    ${data.client_ref ? `<tr><td style="padding:4px 10px 4px 0;color:#6b7280;">Reference</td><td style="padding:4px 0;">${esc(data.client_ref)}</td></tr>` : ""}
    ${data.issued_at ? `<tr><td style="padding:4px 10px 4px 0;color:#6b7280;">Issued</td><td style="padding:4px 0;">${esc(day(data.issued_at))}</td></tr>` : ""}
  </table>

  <h2 style="font-size:14px;color:${NAVY};margin:22px 0 6px;">What you are agreeing to</h2>

  <!-- The wording as it stood when this form was issued. Rendered from the
       document, never from today's constant. -->
  <div style="background:#f7f8fb;border-left:3px solid ${AMBER};padding:14px 16px;margin:0 0 18px;">
    ${esc(data.consent_statement)}
  </div>

  <h2 style="font-size:14px;color:${NAVY};margin:22px 0 6px;">How we handle your information</h2>
  <p style="margin:0 0 10px;">
    We collect your personal information so that Springboard Homes and the parties named above can
    assess whether the Community Funding Program is suitable for you and, if it is, progress your
    enquiry. If you choose not to provide it, we may not be able to assess your enquiry.
  </p>
  <p style="margin:0 0 10px;">
    We do not sell your information. We disclose it only to the parties named above, to service
    providers who help us operate (for example secure document storage and email delivery), and where
    the law requires it.
  </p>
  <p style="margin:0 0 10px;">
    You may ask to see the personal information we hold about you and ask us to correct it, and you
    may withdraw this consent at any time by contacting Springboard Homes — although doing so may
    mean we can no longer progress your enquiry.
  </p>

  <h2 style="font-size:14px;color:${NAVY};margin:22px 0 6px;">Your introducer</h2>
  <p style="margin:0 0 10px;">
    ${field(data.firm_name)} is an independent introducer. They are not an employee or agent of Your
    Loan Assist, they do not provide credit assistance or financial advice to you, and they may be
    paid a fee if you proceed.
  </p>

  ${data.signers.map((s, i) => signatureBlock(s.name, sigs[i], i)).join("")}

  <div style="margin-top:26px;padding-top:10px;border-top:1px solid #e1e4ec;color:#9ca3af;font-size:10px;">
    ${esc(title)} &middot; ${field(data.firm_name)} &middot; This document was executed electronically.
    Each signature above was captured with the signer's IP address, browser and a timestamp, which are
    retained with the signed copy.
  </div>
</body></html>`;
}
