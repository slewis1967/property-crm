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
import { INTRODUCER_DOC_LABEL, type IntroducerAgreementData } from "../introducer-agreement";

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


/**
 * The banner on an amended document.
 *
 * Loud on purpose, and immediately under the title. A person asked to sign a
 * second copy of something they signed last week will assume it is a duplicate
 * unless the page tells them otherwise — and if they assume that, the amendment
 * achieves nothing. Empty for an original issue, which is nearly every document.
 */
function amendmentBanner(d: IntroducerAgreementData): string {
  /* THE REASON IS WHAT MAKES IT AN AMENDMENT, not the date. Gating on the date
   * meant a re-issue whose original signing timestamp we could not read printed
   * NO banner at all — the signer would get a document that looked identical to
   * the one they signed, with nothing on it to say why it had come back. The
   * date is a nicety; the notice is the point. */
  if (!d.amendment_reason.trim() && !d.amends_signed_on.trim()) return "";
  const when = d.amends_signed_on.trim()
    ? ` you signed on ${esc(d.amends_signed_on)}`
    : " you signed earlier";
  return `
    <div style="border:2px solid ${AMBER};background:#fdf6ef;padding:12px 14px;margin:0 0 20px;">
      <div style="font-weight:700;color:${NAVY};margin-bottom:4px;">
        This replaces the ${esc(INTRODUCER_DOC_LABEL[d.doc_type])}${when}.
      </div>
      <div>${
        d.amendment_reason.trim()
          ? esc(d.amendment_reason)
          : "It has been amended and re-issued for signature."
      }</div>
      <div style="margin-top:6px;color:#6b7280;font-size:12px;">
        The version you signed earlier is kept with your records and is not deleted. This version
        governs from the moment you sign it; until then, the earlier one stands.
      </div>
    </div>`;
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

    /* NO BUILDER-COMMISSION SHARE, on either variant (Sean, 17 Sep 2026,
     * briefing item 2026-09-15-b). Pack Document 2 v3.2 governs the fee model:
     * Springboard pays the introducer nothing (cl 9.2), and the paid variant
     * adds only the Referral Fee (Document 2A). The 75/90% builder share this
     * schedule used to open with was never in the pack, and two introducers
     * signed it. These paragraphs are common to both variants. */
    const noShare = `
      <p><strong>Completed homes only.</strong> The programme covers a <strong>completed home, ready to
        move into</strong>. It does not include house-and-land packages, off-the-plan, or any property
        still to be built.</p>
      <p><strong>No share of any builder&rsquo;s commission.</strong> Springboard does not share with
        you any commission, marketing fee or other amount it receives from a builder, developer or
        vendor, and you must not represent to any person that it does.</p>
      <p><strong>What the client pays Springboard is not shared.</strong> Any fee a client pays
        Springboard is consideration for Springboard&rsquo;s own work. It is not shared with you and
        forms no part of what you are paid under this schedule, whatever the client is charged and
        whether or not the matter settles.</p>
      <p><strong>A builder Springboard has no agreement with.</strong> If your client wants to buy
        through someone Springboard has no agreement with, you may introduce us to that builder. You
        must not tell your client or the builder that a fee is payable, that an agreement will be
        reached, or that any particular outcome is assured.</p>`;

    /* The standard arrangement pays nothing. "Referral Fee" below is a DEFINED
     * TERM: the separate per-matter payment offered by invitation. Saying it
     * plainly matters — an introducer who hears about someone else's Referral
     * Fee needs their own document to answer the question. */
    if (d.variant === "standard") {
      return `${head}
      <p><strong>Springboard pays you nothing.</strong> No referral fee, commission, retainer, salary,
        allowance, reimbursement or other payment is payable by Springboard to you under or in
        connection with the Introducer Referral Agreement.</p>
      ${noShare}
      ${d.fee_notes.trim() ? `<p>${esc(d.fee_notes)}</p>` : ""}
      <p><strong>No Referral Fee is payable.</strong> A Referral Fee is a separate per-matter payment
        that Springboard makes to some introducers, by invitation and under a separate document. You are
        not on that arrangement and must not represent to any person that you are.</p>
      <p><strong>What you may charge your own client.</strong> Nothing under this agreement. Any fee you
        charge your client for your own services is a matter between you and them, is not a Springboard
        fee, and must not be described as one.</p>
      <p><strong>If this changes.</strong> The Referral Fee arrangement is offered by invitation and is
        documented separately. Until you have signed that document, this clause governs.</p>`;
    }

    /* THE TERMS BELOW TRACK THE REFERRAL FEE ADDENDUM (Document 2B) and must
     * continue to. Two instruments describing one fee is already one too many;
     * two describing it DIFFERENTLY is a dispute waiting to be had. An earlier
     * version of this renderer said "paid within 30 days of settlement", which
     * the addendum does not say and Springboard could not honour — it pays out
     * of a Program Fee that has not necessarily cleared by then. If the
     * addendum changes, change this with it.
     *
     * ONE PHRASE IS RESERVED. "No referral fee is payable" opens the STANDARD
     * schedule, where it means Springboard pays nothing at all. Nothing in the
     * paid schedule may lead with it — a conditional withholding and a blanket
     * "we pay you nothing" must not read alike to someone skimming their own
     * contract. A test pins this. */
    const network = d.recruits_introducers;

    return `${head}
      <p><strong>The Referral Fee.</strong> Springboard pays you the Referral Fee below for each referred
        client whose purchase of Springboard stock reaches settlement, on the conditions in this
        schedule. Apart from that Referral Fee, Springboard pays you nothing.</p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
        <tr>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;background:#f7f8fb;width:55%;">
            Referral fee, per settled matter${network ? " introduced by you or by an introducer you recruited" : " introduced by you"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;font-weight:600;">
            ${field(d.fee_per_settlement)}
          </td>
        </tr>
      </table>
      ${d.fee_notes.trim() ? `<p>${esc(d.fee_notes)}</p>` : ""}
      <p><strong>One per client.</strong> One referral fee is payable for each client, however many
        referrals, products or people are involved in bringing them to us.</p>
      <p><strong>When it is payable.</strong> A referral fee is earned only when the matter settles, and
        only after Springboard has received its Program Fee for that matter in cleared funds. It is then
        paid within 14 days of your invoice. This is routinely several months after the referral is made:
        it is not near-term income and must never be presented to anyone as if it were. Nothing is
        payable on a referral that does not settle, whatever the reason.</p>
      <p><strong>If it unwinds.</strong> The fee is repayable on demand if the settlement is later
        rescinded or unwound, or if Springboard&rsquo;s Program Fee is refunded or clawed back.</p>
      <p><strong>Disclosure is a condition of payment.</strong> A referral fee is withheld for any client
        who was not given the referral-fee disclosure required by your Referral Fee Addendum, before any
        personal information was collected from them, whether or not the matter settles. Springboard may
        require the signed disclosure before paying and will not pay without it.</p>
      <p><strong>Accreditation must be current.</strong> A referral earns nothing if the accreditation of
        the introducer who made it was suspended, lapsed or withdrawn at the moment it was made${
          network ? ", and nothing is payable to you on a network referral unless your own accreditation is also current at that moment" : ""
        }.</p>
      ${
        network
          ? `<p><strong>Introducers you recruit.</strong> You are paid the fee above on a settled matter
              introduced by an accredited introducer you recruited into the programme, on the same
              conditions as your own. Every such introducer is separately accredited by Springboard,
              contracts with Springboard directly, and is responsible for their own conduct and
              disclosure; recruiting them makes you neither their employer nor their principal, and
              confers on you no authority over their referrals.</p>
             <p><strong>What you pay them is yours to decide.</strong> Whether you pay an introducer you
              recruited any share of this fee, and how much, is a matter between you and them.
              Springboard is not a party to it, pays them nothing, and owes them nothing. You must not
              represent otherwise, and any arrangement you make with them must not require or encourage
              anything their own agreement with Springboard forbids.</p>`
          : ""
      }
      ${noShare}
      <p><strong>What it is not.</strong> This fee is consideration for an introduction only. It is not
        payable for, and must not be represented as payment for, credit assistance, financial advice, or
        any service requiring a licence you do not hold.</p>
      <p><strong>GST.</strong> Amounts are inclusive of GST where you are registered; you must provide a
        valid tax invoice or accept a recipient-created tax invoice from us.</p>`;
  }

  return `
    <p>This agreement is between ${field(d.licensor_name)} (ABN ${field(d.licensor_abn)}), trading
      as Springboard Homes ("Springboard"), and
      ${field(d.firm_name || d.legal_name)}${identifiers(d)}${
        d.registered_address.trim() ? ` of ${esc(d.registered_address)}` : ""
      } ("you"), accreditation ${field(d.accreditation_no)}.</p>
    <p>Springboard holds Introducer reference ${field(d.licence_ref)} with CRE8 Finance Pty Ltd t/a Your
      Loan Assist (ABN 69 605 092 377), the holder of Australian Credit Licence 477483, in respect of the
      Community Funding Program. ${field(d.licence_ref)} is an internal introducer reference issued by Your
      Loan Assist and is not an ASIC licence or registration. Australian Credit Licence 477483 is held by
      CRE8 Finance Pty Ltd, not by Springboard and not by you, and you must not misdescribe either.</p>
    <p><strong>1. What you may do.</strong> You may introduce a person who has consented to the
      introduction to Springboard, by submitting their details through the Springboard introducer portal.
      That is the whole of your role.</p>
    <p><strong>2. Program stock.</strong> A client you introduce may use the programme to buy any
      <strong>completed home, ready to move into</strong>, that the lender approves. The programme does
      not include house-and-land packages, off-the-plan, or any property still to be built, and you must
      not present one to a client as though it were part of it. Any Referral Fee under this agreement is
      payable only on a purchase of a property sourced by Springboard under a marketing, sales or agency
      agreement between Springboard and the builder, developer or vendor ("Springboard stock"). You must
      not use the programme, or any indication that a client may qualify for it, to secure or advance the
      sale of a property you or a related entity hold, list or represent outside those arrangements, and
      if a client you introduced wishes to buy such a property you must tell Springboard before
      proceeding. If your client wants to buy through a builder Springboard has no agreement with, you
      may introduce that builder to Springboard. You must not commit Springboard to any arrangement with
      a builder, negotiate terms on its behalf, or tell a client or a builder that an agreement will be
      reached or that a fee is payable before one is in place.</p>
    <p><strong>3. What you must not do.</strong> You must not provide credit assistance, suggest or
      assist a person to apply for a particular credit product, advise on the suitability of any product,
      or say anything about a product's terms beyond the approved language issued to you. If you are
      asked something outside that language, you must refer the question to Springboard.</p>
    <p><strong>4. Consent and privacy.</strong> You must obtain the person's consent before passing their
      details to us, tell them who we are and why, and collect no more than the portal asks for. You must
      comply with the Privacy Act 1988 (Cth), the Spam Act 2003 (Cth) and the Do Not Call Register Act
      2006 (Cth) in everything you do under this agreement.</p>
    <p><strong>5. Advertising.</strong> You must not publish any advertising or promotional material
      referring to Springboard, the programme, or any credit product without our prior written approval
      of that specific material. This includes material that is spoken rather than written.</p>
    <p><strong>6. Accreditation.</strong> Your accreditation is personal to you, is not transferable, and
      may be suspended or withdrawn by us at any time. You must tell us promptly if you become bankrupt,
      are banned or disqualified by ASIC, or are convicted of an offence involving dishonesty.</p>
    <p><strong>7. Fees.</strong> ${
        d.variant === "paid"
          ? `Springboard will pay you the Referral Fee set out in the Commission Schedule for each ` +
            `client you introduce whose purchase of Springboard stock reaches settlement, on the ` +
            `conditions in that schedule. Apart from that Referral Fee, Springboard pays you nothing.`
          : `Springboard pays you nothing. No referral fee, commission, retainer, salary, allowance, ` +
            `reimbursement or other payment is payable by Springboard to you under or in connection ` +
            `with this agreement. A Referral Fee is a separate arrangement offered by invitation, and ` +
            `you are not on it.`
      } Springboard does not share with you any commission or other amount it receives from a builder,
      developer or vendor. Any fee a client pays Springboard is for Springboard&rsquo;s own work and is
      not shared with you. The Commission Schedule forms part of this agreement. No other fee is
      payable.</p>
    <p><strong>8. Relationship.</strong> You are an independent contractor. Nothing here makes you our
      employee, partner, agent or authorised representative, and you must not hold yourself out as any of
      those.</p>
    <p><strong>9. Termination.</strong> Either of us may end this agreement on 14 days' written notice,
      or immediately for breach. Clauses 3, 4, 5 and the confidentiality agreement survive termination.</p>
    <p><strong>10. Governing law.</strong> Queensland, Australia.</p>`;
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
  ${amendmentBanner(data)}
  ${clauses(data)}
  ${signatureBlock(data, sig)}
  <div style="margin-top:26px;padding-top:10px;border-top:1px solid #e1e4ec;color:#9ca3af;font-size:10px;">
    ${esc(title)} &middot; ${field(data.firm_name || data.legal_name)} &middot; This document was executed
    electronically. The signature above was captured with the signer's IP address, browser and a
    timestamp, which are retained with the signed copy.
  </div>
</body></html>`;
}
