/**
 * Render one of the three introducer documents to standalone, print-ready HTML.
 *
 * Plain string templating rather than a React print component: these documents
 * are static prose with a handful of merge fields and one signature block, so a
 * component would add the app graph as a dependency and buy nothing. Everything
 * is inline-styled because the headless browser that turns this into a PDF never
 * loads the app stylesheet.
 *
 * Springboard navy #020e40 / amber #c7894e, matching every other introducer-
 * facing surface.
 */

import type { SignatureMark } from "../signatures";
import {
  INTRODUCER_DOC_LABEL,
  type IntroducerAgreementData,
} from "../introducer-agreement";

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

/**
 * "(ABN 51 824 753 556, ACN 004 085 616)" — whichever the entity actually has.
 *
 * A company gets both: the ACN is the identifier that survives a name change,
 * which is precisely what you want in a contract that may be read years later.
 * A sole trader has no ACN, so demanding one would print a permanent
 * "[not supplied]" against a fact that does not exist.
 */
function identifiers(d: IntroducerAgreementData): string {
  const parts: string[] = [];
  if (d.abn.trim()) parts.push(`ABN ${esc(d.abn)}`);
  if (d.acn.trim()) parts.push(`ACN ${esc(d.acn)}`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function clauses(d: IntroducerAgreementData): string {
  if (d.doc_type === "introducer_nda") {
    return `
      <p><strong>1. Purpose.</strong> ${field(d.licensor_name)} ("Springboard") and
        ${field(d.firm_name || d.legal_name)} ("you") wish to discuss your possible accreditation as an
        introducer to the Springboard Community Funding Program. Each of us will disclose confidential
        information to the other for that purpose and no other.</p>
      <p><strong>2. What is confidential.</strong> The programme's commercial terms, referral fee
        arrangements, training materials, approved client-facing language, systems and client
        information, in any form and whether or not marked confidential.</p>
      <p><strong>3. Your obligations.</strong> You will keep that information confidential, use it only
        to evaluate and perform the introducer relationship, and not disclose it to anyone else without
        our written consent. You will not use it to compete with us or to solicit our clients.</p>
      <p><strong>4. Exceptions.</strong> This does not apply to information that is public through no
        fault of yours, that you already lawfully held, or that you are compelled by law to disclose —
        in which case you will tell us first if you lawfully can.</p>
      <p><strong>5. No obligation.</strong> Nothing here obliges either of us to proceed with an
        introducer relationship, and this agreement does not create one.</p>
      <p><strong>6. Duration.</strong> These obligations continue for three years from the date below,
        and indefinitely for any client information.</p>
      <p><strong>7. Governing law.</strong> Queensland, Australia.</p>`;
  }

  if (d.doc_type === "introducer_schedule") {
    const head = `
      <p>This schedule forms part of the Introducer Referral Agreement between ${field(d.licensor_name)}
        and ${field(d.firm_name || d.legal_name)}, accreditation ${field(d.accreditation_no)}.</p>`;

    // The standard arrangement pays nothing. Saying so plainly is the whole
    // content of this schedule — an empty fee table would read as an oversight.
    if (d.variant === "standard") {
      return `${head}
      <p><strong>No referral fee is payable.</strong> Springboard does not pay you a fee, commission or
        other consideration for introducing a client, and you must not represent to any person that it
        does.</p>
      ${d.fee_notes.trim() ? `<p>${esc(d.fee_notes)}</p>` : ""}
      <p><strong>What you may charge.</strong> Nothing under this agreement. Any fee you charge your own
        client for your own services is a matter between you and them, is not a Springboard fee, and must
        not be described as one.</p>
      <p><strong>If this changes.</strong> A paid arrangement is offered by invitation and is documented
        separately. Until you have signed that document, this clause governs.</p>`;
    }

    return `${head}
      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
        <tr>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;background:#f7f8fb;width:55%;">
            Referral fee, per settled matter introduced by you
          </td>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;font-weight:600;">
            ${field(d.fee_per_settlement)}
          </td>
        </tr>
      </table>
      ${d.fee_notes.trim() ? `<p>${esc(d.fee_notes)}</p>` : ""}
      <p><strong>When it is payable.</strong> A referral fee is earned only when the matter you
        introduced settles, and is paid within 30 days of settlement. Nothing is payable on a referral
        that does not settle, whatever the reason.</p>
      <p><strong>What it is not.</strong> This fee is consideration for an introduction only. It is not
        payable for, and must not be represented as payment for, credit assistance, financial advice, or
        any service requiring a licence you do not hold.</p>
      <p><strong>GST.</strong> Amounts are inclusive of GST where you are registered; you must provide a
        valid tax invoice or accept a recipient-created tax invoice from us.</p>`;
  }

  return `
    <p>This agreement is between ${field(d.licensor_name)} (ABN ${field(d.licensor_abn)}),
      operating under credit representative reference ${field(d.licence_ref)} ("Springboard"), and
      ${field(d.firm_name || d.legal_name)}${identifiers(d)}${
        d.registered_address.trim() ? ` of ${esc(d.registered_address)}` : ""
      } ("you"), accreditation ${field(d.accreditation_no)}.</p>
    <p><strong>1. What you may do.</strong> You may introduce a person who has consented to the
      introduction to Springboard, by submitting their details through the Springboard introducer portal.
      That is the whole of your role.</p>
    <p><strong>2. What you must not do.</strong> You must not provide credit assistance, suggest or
      assist a person to apply for a particular credit product, advise on the suitability of any product,
      or say anything about a product's terms beyond the approved language issued to you. If you are
      asked something outside that language, you must refer the question to Springboard.</p>
    <p><strong>3. Consent and privacy.</strong> You must obtain the person's consent before passing their
      details to us, tell them who we are and why, and collect no more than the portal asks for. You must
      comply with the Privacy Act 1988 (Cth), the Spam Act 2003 (Cth) and the Do Not Call Register Act
      2006 (Cth) in everything you do under this agreement.</p>
    <p><strong>4. Advertising.</strong> You must not publish any advertising or promotional material
      referring to Springboard, the programme, or any credit product without our prior written approval
      of that specific material. This includes material that is spoken rather than written.</p>
    <p><strong>5. Accreditation.</strong> Your accreditation is personal to you, is not transferable, and
      may be suspended or withdrawn by us at any time. You must tell us promptly if you become bankrupt,
      are banned or disqualified by ASIC, or are convicted of an offence involving dishonesty.</p>
    <p><strong>6. Fees.</strong> ${
      d.variant === "paid"
        ? `Springboard will pay you a Referral Fee for each settled referral, as set out in the ` +
          `Commission Schedule, which forms part of this agreement. No other fee is payable.`
        : `Springboard pays you no fee, commission or other consideration for an introduction. ` +
          `See the Commission Schedule, which forms part of this agreement.`
    }</p>
    <p><strong>7. Relationship.</strong> You are an independent contractor. Nothing here makes you our
      employee, partner, agent or authorised representative, and you must not hold yourself out as any of
      those.</p>
    <p><strong>8. Termination.</strong> Either of us may end this agreement on 14 days' written notice,
      or immediately for breach. Clauses 2, 3, 4 and the confidentiality agreement survive termination.</p>
    <p><strong>9. Governing law.</strong> Queensland, Australia.</p>`;
}

function signatureBlock(d: IntroducerAgreementData, sig: SignatureMark | null | undefined): string {
  const image = sig?.image
    ? `<img src="${esc(sig.image)}" alt="" style="height:52px;display:block;" />`
    : `<div style="height:52px;"></div>`;
  return `
    <div style="margin-top:34px;padding-top:16px;border-top:2px solid ${NAVY};">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:10px;">
        Signed by the introducer
      </div>
      ${image}
      <div style="border-top:1px solid #9ca3af;width:280px;margin-top:4px;padding-top:5px;font-size:13px;">
        <strong>${field(sig?.name || d.legal_name)}</strong><br />
        <span style="color:#6b7280;">${esc(d.firm_name)}</span><br />
        <span style="color:#6b7280;">Date: ${sig?.date ? esc(sig.date) : "&nbsp;"}</span>
      </div>
    </div>`;
}

export async function renderIntroducerAgreementHtml(
  data: IntroducerAgreementData,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  const sig = signatures?.[0] ?? null;
  const title = INTRODUCER_DOC_LABEL[data.doc_type];

  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0;background:#fff;}
  @page{size:A4;margin:18mm 16mm;}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430;font-size:13px;line-height:1.65;}
  h1{font-size:20px;color:${NAVY};margin:0 0 4px;}
  p{margin:9px 0;}
  strong{font-weight:650;}
</style></head><body>
  <div style="border-bottom:3px solid ${AMBER};padding-bottom:10px;margin-bottom:22px;">
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${AMBER};font-weight:700;">
      Springboard Homes
    </div>
    <h1>${esc(title)}</h1>
    <div style="color:#6b7280;font-size:12px;">
      ${data.subtitle.trim() ? esc(data.subtitle) + " &middot; " : ""}Issued ${field(data.issued_at)}
      ${data.accreditation_no.trim() ? " &middot; Accreditation " + esc(data.accreditation_no) : ""}
      ${
        data.variant === "paid" && data.doc_type !== "introducer_nda"
          ? ` &middot; <strong style="color:${AMBER};">Paid arrangement</strong>`
          : ""
      }
    </div>
  </div>
  ${clauses(data)}
  ${signatureBlock(data, sig)}
  <div style="margin-top:26px;padding-top:10px;border-top:1px solid #e1e4ec;color:#9ca3af;font-size:10px;">
    ${esc(title)} &middot; ${field(data.firm_name || data.legal_name)} &middot; This document was executed
    electronically. The signature above was captured with the signer's IP address, browser and a
    timestamp, which are retained with the signed copy.
  </div>
</body></html>`;
}
