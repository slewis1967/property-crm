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
  formatSharePct,
  isValidSharePct,
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

/**
 * The builder-commission split, as it appears in the prose.
 *
 * `readyToIssue` refuses both money-bearing documents without it, so a blank
 * here should be unreachable. It still renders as a visible gap rather than a
 * plausible-looking default: a wrong percentage in a signed contract is far
 * worse than an obvious hole in a draft.
 */
function sharePhrase(d: IntroducerAgreementData): string {
  return isValidSharePct(d.builder_share_pct)
    ? esc(formatSharePct(d.builder_share_pct))
    : `<span style="background:#fff3cd;color:#8a6d3b;padding:0 4px;">[share not set]</span>`;
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

    /* THE BUILDER-COMMISSION SHARE OPENS EVERY SCHEDULE, on both variants.
     *
     * It is the primary arrangement and the one every accredited introducer is
     * on. The standard schedule used to open by saying Springboard "does not
     * pay you a fee, commission or other consideration for introducing a
     * client, and you must not represent to any person that it does" — which
     * became flatly untrue the moment the panel split existed, and told the
     * introducer to deny their own contract to clients. It is gone. */
    const builderShare = `
      <table style="width:100%;border-collapse:collapse;margin:18px 0;font-size:13px;">
        <tr>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;background:#f7f8fb;width:55%;">
            Your share of the commission Springboard receives from the builder,
            per settled matter you introduce
          </td>
          <td style="padding:10px 12px;border:1px solid #e1e4ec;font-weight:600;">
            ${sharePhrase(d)}
          </td>
        </tr>
      </table>
      <p><strong>Panel stock only.</strong> That share is payable on a matter settled on stock sourced
        from the Springboard builder panel. You must source what you introduce from that panel; a matter
        settled on stock from anywhere else earns nothing under this schedule.</p>
      <p><strong>When it is payable.</strong> The share is earned when the matter settles, and is payable
        only after Springboard has received the corresponding commission from the builder in cleared
        funds. It is then paid within 14 days of your invoice. This is routinely several months after the
        introduction is made: it is not near-term income and must never be presented to anyone as if it
        were. Nothing is payable on a matter that does not settle, whatever the reason.</p>
      <p><strong>If it unwinds.</strong> The share is repayable on demand if the settlement is later
        rescinded or unwound, or if the builder&rsquo;s commission is refunded or clawed back.</p>
      <p><strong>What the client pays Springboard is not shared.</strong> Any fee a client pays
        Springboard is consideration for Springboard&rsquo;s own work. It is not shared with you and
        forms no part of what you are paid under this schedule, whatever the client is charged and
        whether or not the matter settles.</p>
      <p><strong>A builder who is not on the panel.</strong> If your client wants to build with someone
        Springboard has no agreement with, introduce us to that builder. If Springboard reaches an
        agreement with them, their stock becomes panel stock and your client&rsquo;s matter earns the
        share above on the same terms as any other. Until that agreement is in place there is no builder
        commission for you to have a share of, and you must not tell your client or the builder that a
        fee is payable, that an agreement will be reached, or that any particular outcome is assured.</p>`;

    /* The standard arrangement is the builder share and nothing else. The
     * phrase below is a DEFINED TERM, not a blanket denial: "Referral Fee"
     * means the separate per-matter payment out of the Program Fee, which is
     * offered by invitation. Saying it plainly matters — an introducer who
     * hears about someone else's Referral Fee needs their own document to
     * answer the question. */
    if (d.variant === "standard") {
      return `${head}
      ${builderShare}
      ${d.fee_notes.trim() ? `<p>${esc(d.fee_notes)}</p>` : ""}
      <p><strong>No Referral Fee is payable.</strong> A Referral Fee is a separate per-matter payment
        that Springboard makes to some introducers out of its Program Fee, by invitation and under a
        separate addendum. You are not on that arrangement and must not represent to any person that you
        are. It does not affect your share of the builder&rsquo;s commission above, which is payable in
        the ordinary way.</p>
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
      ${builderShare}
      <p style="margin-top:22px;"><strong>And a Referral Fee as well.</strong> Separately from the share
        above, and paid from a different place &mdash; Springboard&rsquo;s Program Fee rather than the
        builder&rsquo;s commission &mdash; you are also paid the following. The two are cumulative: being
        paid one does not reduce or replace the other.</p>
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
    <p><strong>2. Panel stock.</strong> You must source the stock you introduce from the Springboard
      builder panel. If your client wants to build with a builder who is not on the panel, you may
      introduce that builder to Springboard so that an agreement can be arranged with them; if one is
      reached, their stock becomes panel stock. You must not commit Springboard to any arrangement with a
      builder, negotiate terms on its behalf, or tell a client or a builder that an agreement will be
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
    <p><strong>7. Fees.</strong> Springboard will pay you ${sharePhrase(d)} of the commission it
      receives from the builder on each matter you introduce that settles on panel stock, payable once
      Springboard has been paid that commission in cleared funds.${
        d.variant === "paid"
          ? ` Springboard will also pay you a Referral Fee for each settled matter, out of its Program ` +
            `Fee. The two are cumulative and are paid from different sources.`
          : ` No Referral Fee is payable — that is a separate arrangement offered by invitation.`
      } Any fee a client pays Springboard is for Springboard&rsquo;s own work and is not shared with you.
      Both the share and any Referral Fee are set out in the Commission Schedule, which forms part of
      this agreement. No other fee is payable.</p>
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
  ${clauses(data)}
  ${signatureBlock(data, sig)}
  <div style="margin-top:26px;padding-top:10px;border-top:1px solid #e1e4ec;color:#9ca3af;font-size:10px;">
    ${esc(title)} &middot; ${field(data.firm_name || data.legal_name)} &middot; This document was executed
    electronically. The signature above was captured with the signer's IP address, browser and a
    timestamp, which are retained with the signed copy.
  </div>
</body></html>`;
}
