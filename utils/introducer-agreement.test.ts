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

describe("the builder-commission share", () => {
  const sched = (over: Record<string, unknown> = {}) => ({
    ...complete(),
    doc_type: "introducer_schedule" as const,
    ...over,
  });

  it("refuses a money-bearing document with no share", () => {
    for (const t of ["introducer_agreement", "introducer_schedule"] as const) {
      const r = readyToIssue({ ...complete(), doc_type: t, builder_share_pct: null });
      expect(r.ok, t).toBe(false);
      if (!r.ok) expect(r.reason, t).toMatch(/builder-commission share/);
    }
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

  it("states the panel-only obligation and the off-panel pathway", async () => {
    const html = (await renderIntroducerAgreementHtml(sched())).replace(/\s+/g, " ");
    expect(html).toMatch(/Panel stock only/);
    expect(html).toMatch(/settled on stock from anywhere else, or on a property not yet complete, earns nothing/);
    // Sean's rule: they introduce the builder, and only then does it count.
    expect(html).toMatch(/introduce us to that builder/);
    expect(html).toMatch(/their completed stock becomes panel stock/);
  });

  it("pays the share only once the builder has actually paid us", async () => {
    const html = (await renderIntroducerAgreementHtml(sched())).replace(/\s+/g, " ");
    expect(html).toMatch(/after Springboard has received the corresponding commission from the builder in cleared funds/);
  });

  it("says the client's own fee is shared with no one", async () => {
    const html = (await renderIntroducerAgreementHtml(sched())).replace(/\s+/g, " ");
    // &rsquo; in the rendered HTML, so match around the apostrophe.
    expect(html).toMatch(/consideration for Springboard\S* own work/);
    expect(html).toMatch(/not shared with you/);
  });

  it("renders a missing share visibly rather than inventing one", async () => {
    // Unreachable through readyToIssue, and that is exactly why it must not
    // quietly print a plausible number if it ever happens.
    const html = await renderIntroducerAgreementHtml(sched({ builder_share_pct: null }));
    expect(html).toContain("[share not set]");
    expect(html).not.toContain("75%");
    expect(html).not.toContain("90%");
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

  it("a standard schedule owes no Referral Fee, but still shows the builder share", async () => {
    const html = await renderIntroducerAgreementHtml(sched("standard"));
    // "Referral Fee" is a DEFINED TERM — the separate payment out of the
    // Program Fee — so saying it is not payable stays true and stays useful.
    expect(html).toMatch(/No Referral Fee is payable/);
    expect(html).not.toMatch(/Referral fee, per settled matter/);
    // But it must never again deny payment altogether. A standard introducer
    // IS paid: 75% or 90% of the builder commission on settled panel stock.
    // The old wording told them to deny that to clients.
    expect(html).not.toMatch(/does not pay you a fee, commission or other consideration/);
    expect(html).toContain("90%");
  });

  it("a paid schedule states the amount", async () => {
    const html = await renderIntroducerAgreementHtml(sched("paid", "$5,000 inc GST"));
    expect(html).toContain("$5,000 inc GST");
    expect(html).toMatch(/Referral fee, per settled matter/);
    expect(html).not.toMatch(/No referral fee is payable/);
  });

  it("the fees clause matches the variant, and both are paid the share", async () => {
    const standard = await renderIntroducerAgreementHtml({ ...complete(), variant: "standard" });
    expect(standard).toMatch(/will pay you 90% of the commission it/);
    expect(standard).toMatch(/No Referral Fee is payable/);
    // The sentence that became false the moment the panel split existed.
    expect(standard).not.toMatch(/pays you no fee, commission or other consideration/);

    const paid = await renderIntroducerAgreementHtml({ ...complete(), variant: "paid" });
    expect(paid).toMatch(/will pay you 90% of the commission it/);
    expect(paid).toMatch(/also pay you a Referral Fee/);
    expect(paid).toMatch(/cumulative/);
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
