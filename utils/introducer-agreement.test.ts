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

describe("refusing to issue something that would be signed with blanks", () => {
  it("refuses a commission schedule with no fee", () => {
    const d = { ...complete(), doc_type: "introducer_schedule" as const, fee_per_settlement: "" };
    const r = readyToIssue(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/contract about nothing/);
  });

  it("allows a schedule once the fee is set", () => {
    const d = { ...complete(), doc_type: "introducer_schedule" as const, fee_per_settlement: "$2,500" };
    expect(readyToIssue(d).ok).toBe(true);
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
