import { describe, it, expect } from "vitest";
import {
  INTRODUCER_DOC_TYPES,
  hydrateIntroducerAgreement,
  emptyIntroducerAgreement,
  introducerAgreementSummary,
  introducerProposedSigners,
  readyToIssue,
  INTRODUCER_DOC_TERMINAL_STATUS,
} from "./introducer-agreement";
import { SIGN_DOC_TYPES, DOC_TYPE_LABEL, isSignDocType } from "./signatures";
import { LOCKED_STATUS } from "./compliance-audit";
import { renderIntroducerAgreementHtml } from "./pdf/introducerAgreementPdf";

const complete = () => ({
  ...emptyIntroducerAgreement("introducer_agreement"),
  legal_name: "Jane Smith",
  email: "jane@example.com.au",
  firm_name: "Smith Advisory Pty Ltd",
  accreditation_no: "SBI-2026-0001",
  issued_at: "13 August 2026",
  // Every money-bearing document carries one; 90 is the Tier 2 default.
  builder_share_pct: 90,
});

describe("registration with the signing engine", () => {
  it("registers all three documents as signable", () => {
    for (const t of INTRODUCER_DOC_TYPES) {
      expect(SIGN_DOC_TYPES, t).toContain(t);
      expect(isSignDocType(t), t).toBe(true);
    }
  });

  it("gives each one a signer-facing label", () => {
    for (const t of INTRODUCER_DOC_TYPES) {
      expect(DOC_TYPE_LABEL[t], t).toBeTruthy();
      // A signer must never be shown an internal key.
      expect(DOC_TYPE_LABEL[t], t).not.toMatch(/introducer_/);
    }
  });

  it("locks each one at the same terminal status", () => {
    for (const t of INTRODUCER_DOC_TYPES) {
      expect(LOCKED_STATUS[t], t).toBe(INTRODUCER_DOC_TERMINAL_STATUS);
    }
  });
});

describe("hydration is tolerant", () => {
  it("survives null, junk and a partial blob", () => {
    for (const blob of [null, undefined, {}, { legal_name: 5 }, "nonsense"]) {
      expect(() => hydrateIntroducerAgreement(blob)).not.toThrow();
    }
    expect(hydrateIntroducerAgreement(null).licensor_name).toBeTruthy();
  });

  it("falls back to the agreement when doc_type is unrecognised", () => {
    expect(hydrateIntroducerAgreement({ doc_type: "nope" }).doc_type).toBe("introducer_agreement");
  });

  it("keeps what it is given", () => {
    const d = hydrateIntroducerAgreement({ doc_type: "introducer_nda", legal_name: "Jane Smith" });
    expect(d.doc_type).toBe("introducer_nda");
    expect(d.legal_name).toBe("Jane Smith");
  });
});

/**
 * NO BUILDER-COMMISSION SHARE (Sean, 17 Sep 2026, briefing item 2026-09-15-b).
 * Pack Document 2 v3.2 governs: Springboard pays the introducer nothing, and the
 * paid variant adds only a Referral Fee. Two introducers signed a 90% share and
 * "credit representative reference COMP-8317" on 21 Aug; neither may come back.
 */
describe("no builder-commission share", () => {
  const sched = (over: Record<string, unknown> = {}) => ({
    ...complete(),
    doc_type: "introducer_schedule" as const,
    ...over,
  });

  it("issues a money-bearing document with no share", () => {
    for (const t of ["introducer_agreement", "introducer_schedule"] as const) {
      const r = readyToIssue({ ...complete(), doc_type: t, builder_share_pct: null });
      expect(r.ok, t).toBe(true);
    }
  });

  it("prints no share and no percentage of any commission, even from legacy data", async () => {
    for (const variant of ["standard", "paid"] as const) {
      for (const t of ["introducer_agreement", "introducer_schedule"] as const) {
        const html = (
          await renderIntroducerAgreementHtml(sched({ doc_type: t, variant, fee_per_settlement: "$5,000" }))
        ).replace(/\s+/g, " ");
        const k = `${variant} ${t}`;
        expect(html, k).not.toMatch(/% of the commission/);
        expect(html, k).not.toContain("90%");
        expect(html, k).not.toMatch(/Your share of the commission/);
        expect(html, k).not.toContain("[share not set]");
        expect(html, k).toMatch(/not share with you any commission/);
      }
    }
  });

  it("never calls COMP-8317 a credit representative reference", async () => {
    const html = (await renderIntroducerAgreementHtml(sched({ doc_type: "introducer_agreement" }))).replace(/\s+/g, " ");
    expect(html).not.toMatch(/credit representative reference/i);
    // Document 2 recital (a) and clause 4, instead.
    expect(html).toMatch(/holds Introducer reference COMP-8317 with CRE8 Finance Pty Ltd t\/a Your Loan Assist/);
    expect(html).toMatch(/is not an ASIC licence or registration/);
    expect(html).toMatch(/Australian Credit Licence 477483 is held by CRE8 Finance Pty Ltd, not by Springboard and not by you/);
  });

  it("exempts the NDA, which is signed before any of this is settled", () => {
    const d = {
      ...complete(),
      doc_type: "introducer_nda" as const,
      accreditation_no: "",
      builder_share_pct: null,
    };
    expect(readyToIssue(d).ok).toBe(true);
  });

  it("treats a nonsensical percentage as not stated", () => {
    for (const bad of [0, -5, 101, Number.NaN, "90" as unknown as number]) {
      const d = hydrateIntroducerAgreement({ ...sched(), builder_share_pct: bad });
      expect(d.builder_share_pct, String(bad)).toBeNull();
    }
    expect(hydrateIntroducerAgreement({ ...sched(), builder_share_pct: 87.5 }).builder_share_pct).toBe(87.5);
  });

  /**
   * COMPLETED HOMES, NOT CONSTRUCTION. The programme sells finished stock a
   * client moves into; it does not do house-and-land. The first draft of these
   * clauses said a client might "build with" a builder, which describes a
   * product that is not on offer — and it went out in two signed agreements on
   * 21 August before it was caught. The word is "buy through".
   */
  it("never describes the client as building anything", async () => {
    for (const t of ["introducer_agreement", "introducer_schedule"] as const) {
      const html = (await renderIntroducerAgreementHtml(sched({ doc_type: t }))).replace(/\s+/g, " ");
      expect(html, t).not.toMatch(/build with/i);
      expect(html, t).not.toMatch(/wants to build/i);
      expect(html, t).toMatch(/buy through/i);
    }
  });

  it("says the stock must be a completed home, and rules out house-and-land", async () => {
    for (const t of ["introducer_agreement", "introducer_schedule"] as const) {
      const html = (await renderIntroducerAgreementHtml(sched({ doc_type: t }))).replace(/\s+/g, " ");
      expect(html, t).toMatch(/completed home, ready to move into/);
      expect(html, t).toMatch(/house-and-land/);
      expect(html, t).toMatch(/still to be built/);
    }
  });

  /* D1 option B: a client may buy any completed lender-approved home; a Referral
   * Fee is payable only on Springboard stock; the introducer's own listings stay
   * out of the programme (Document 2 cl 9.5(b)/(c)). */
  it("lets the client buy any approved completed home, and fees follow Springboard stock", async () => {
    const html = (await renderIntroducerAgreementHtml(sched({ doc_type: "introducer_agreement" }))).replace(/\s+/g, " ");
    expect(html).toMatch(/may use the programme to buy any <strong>completed home, ready to move into<\/strong>, that the lender approves/);
    expect(html).toMatch(/Referral Fee under this agreement is payable only on a purchase of a property sourced by Springboard/);
    expect(html).toMatch(/must not use the programme, or any indication that a client may qualify for it, to secure or advance the sale of a property you or a related entity hold, list or represent/);
    expect(html).toMatch(/must tell Springboard before proceeding/);
    expect(html).not.toMatch(/builder panel/);
    // Off-panel builders: they may introduce one, but promise nothing.
    expect(html).toMatch(/may introduce that builder to Springboard/);
  });

  it("the paid schedule pays only on Springboard stock", async () => {
    const html = (await renderIntroducerAgreementHtml(sched({ variant: "paid", fee_per_settlement: "$5,000" }))).replace(/\s+/g, " ");
    expect(html).toMatch(/purchase of Springboard stock reaches settlement/);
    expect(html).toMatch(/Apart from that Referral Fee, Springboard pays you nothing/);
  });

  it("says the client's own fee is shared with no one", async () => {
    const html = (await renderIntroducerAgreementHtml(sched())).replace(/\s+/g, " ");
    // &rsquo; in the rendered HTML, so match around the apostrophe.
    expect(html).toMatch(/consideration for Springboard\S* own work/);
    expect(html).toMatch(/not shared with you/);
  });

});

describe("the fee rule follows the commercial variant", () => {
  const schedule = (variant: "standard" | "paid", fee: string) => ({
    ...complete(),
    doc_type: "introducer_schedule" as const,
    variant,
    fee_per_settlement: fee,
  });

  it("refuses a PAID schedule with no fee", () => {
    const r = readyToIssue(schedule("paid", ""));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/contract about nothing/);
  });

  it("allows a PAID schedule once the fee is set", () => {
    expect(readyToIssue(schedule("paid", "$5,000 inc GST")).ok).toBe(true);
  });

  it("allows a STANDARD schedule with no fee — there isn't one", () => {
    // The bug this pins: requiring a fee on every schedule made the standard
    // arrangement impossible to issue at all.
    expect(readyToIssue(schedule("standard", "")).ok).toBe(true);
  });

  it("refuses a STANDARD schedule that carries a fee", () => {
    // Worse than a blank: it would promise money the standard agreement
    // explicitly says is not payable.
    const r = readyToIssue(schedule("standard", "$5,000"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not payable/);
  });

  it("refuses an agreement with no accreditation number, since it cites one", () => {
    const r = readyToIssue({ ...complete(), accreditation_no: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/accreditation number/);
  });

  it("allows an NDA without one — it is signed before the exam", () => {
    const d = { ...complete(), doc_type: "introducer_nda" as const, accreditation_no: "" };
    expect(readyToIssue(d).ok).toBe(true);
  });

  it("always requires someone to sign it", () => {
    expect(readyToIssue({ ...complete(), legal_name: "" }).ok).toBe(false);
    expect(readyToIssue({ ...complete(), email: "" }).ok).toBe(false);
  });
});

describe("signers and summary", () => {
  it("proposes exactly the one person we invited", () => {
    const s = introducerProposedSigners(complete());
    expect(s).toHaveLength(1);
    expect(s[0]).toEqual({ name: "Jane Smith", email: "jane@example.com.au" });
  });

  it("summarises by firm, falling back to the person", () => {
    expect(introducerAgreementSummary(complete())).toContain("Smith Advisory Pty Ltd");
    expect(introducerAgreementSummary({ ...complete(), firm_name: "" })).toContain("Jane Smith");
  });
});

describe("rendering", () => {
  it("produces a standalone document for each type", async () => {
    for (const t of INTRODUCER_DOC_TYPES) {
      const html = await renderIntroducerAgreementHtml({ ...complete(), doc_type: t });
      expect(html, t).toMatch(/^<!DOCTYPE html>/);
      expect(html, t).toContain(DOC_TYPE_LABEL[t]);
      expect(html, t).toContain("Jane Smith");
    }
  });

  it("bakes in a captured signature when one is supplied", async () => {
    const html = await renderIntroducerAgreementHtml(complete(), [
      { image: "data:image/png;base64,AAAA", name: "Jane Smith", date: "13 Aug 2026" },
    ]);
    expect(html).toContain("data:image/png;base64,AAAA");
    expect(html).toContain("13 Aug 2026");
  });

  it("marks a missing field visibly rather than leaving a silent gap", async () => {
    // A blank that renders as nothing is a blank that gets signed.
    const html = await renderIntroducerAgreementHtml({ ...complete(), accreditation_no: "" });
    expect(html).toContain("[not supplied]");
  });

  it("escapes content rather than letting it become markup", async () => {
    const html = await renderIntroducerAgreementHtml({
      ...complete(),
      firm_name: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("states that the document was executed electronically", async () => {
    const html = await renderIntroducerAgreementHtml(complete());
    expect(html).toMatch(/executed\s+electronically/);
  });
});

describe("the two variants say opposite things about money", () => {
  const sched = (variant: "standard" | "paid", fee = "") => ({
    ...complete(),
    doc_type: "introducer_schedule" as const,
    variant,
    fee_per_settlement: fee,
  });

  it("a standard schedule pays nothing and owes no Referral Fee", async () => {
    const html = await renderIntroducerAgreementHtml(sched("standard"));
    // "Referral Fee" is a DEFINED TERM — the separate payment by invitation —
    // so saying it is not payable stays true and stays useful.
    expect(html).toMatch(/Springboard pays you nothing/);
    expect(html).toMatch(/No Referral Fee is payable/);
    expect(html).not.toMatch(/Referral fee, per settled matter/);
  });

  it("a paid schedule states the amount", async () => {
    const html = await renderIntroducerAgreementHtml(sched("paid", "$5,000 inc GST"));
    expect(html).toContain("$5,000 inc GST");
    expect(html).toMatch(/Referral fee, per settled matter/);
    expect(html).not.toMatch(/No referral fee is payable/);
  });

  it("the fees clause matches the variant, and neither is paid a share", async () => {
    const standard = (await renderIntroducerAgreementHtml({ ...complete(), variant: "standard" })).replace(/\s+/g, " ");
    expect(standard).toMatch(/7\. Fees\.<\/strong> Springboard pays you nothing/);
    expect(standard).toMatch(/you are not on it/);
    expect(standard).not.toMatch(/will pay you/);

    const paid = (await renderIntroducerAgreementHtml({ ...complete(), variant: "paid" })).replace(/\s+/g, " ");
    expect(paid).toMatch(/will pay you the Referral Fee set out in the Commission Schedule/);
    expect(paid).toMatch(/Apart from that Referral Fee, Springboard pays you nothing/);
    expect(paid).not.toMatch(/cumulative/);
    for (const html of [standard, paid]) expect(html).not.toMatch(/% of the commission/);
  });

  it("marks a paid document on its face, so the two cannot be confused", async () => {
    const paid = await renderIntroducerAgreementHtml({ ...complete(), variant: "paid" });
    expect(paid).toContain("Paid arrangement");
    const standard = await renderIntroducerAgreementHtml({ ...complete(), variant: "standard" });
    expect(standard).not.toContain("Paid arrangement");
  });

  it("hydrates an unknown variant to standard — never invents a fee obligation", () => {
    for (const junk of ["PAID", "commission", "", null, 1]) {
      expect(hydrateIntroducerAgreement({ variant: junk }).variant, String(junk)).toBe("standard");
    }
    expect(hydrateIntroducerAgreement({ variant: "paid" }).variant).toBe("paid");
  });
});
