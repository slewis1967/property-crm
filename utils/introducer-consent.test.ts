import { describe, it, expect } from "vitest";
import {
  buildConsentDoc,
  consentDocSummary,
  consentProposedSigners,
  consentReadyToSend,
  hydrateConsentDoc,
} from "./introducer-consent";
import { CONSENT_STATEMENT } from "./introducer";
import { renderReferralConsentHtml } from "./pdf/referralConsentPdf";
import { DOC_TYPE_LABEL, SIGN_DOC_TYPES } from "./signatures";
import { LOCKED_STATUS } from "./compliance-audit";

/**
 * The client's Referral Consent and Privacy Form, as a signed document.
 *
 * This is the record that answers "what did this person actually agree to" if it
 * is ever challenged, so the tests here are mostly about what must NOT drift:
 * the wording is snapshotted rather than re-derived, every applicant signs for
 * themselves, and a form nobody can sign is never issued.
 */

const referral = {
  client_ref: "NKI-5006",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  suburb: "Brisbane",
  state: "QLD",
  postcode: "4000",
  dob: "1815-12-10",
};

const ISSUED = "2026-08-21T02:00:00.000Z";

describe("buildConsentDoc", () => {
  it("carries the consent wording verbatim", () => {
    const d = buildConsentDoc(referral, { firmName: "Test Firm", issuedAt: ISSUED });
    expect(d.consent_statement).toBe(CONSENT_STATEMENT);
  });

  it("names the introducer firm on the form the client signs", () => {
    const d = buildConsentDoc(referral, { firmName: "Test Firm", issuedAt: ISSUED });
    expect(d.firm_name).toBe("Test Firm");
  });

  /**
   * Consent covers each person's OWN information. One signature on a
   * two-applicant referral is one person's consent, not the household's.
   */
  it("lists a second applicant as their own signer", () => {
    const d = buildConsentDoc(
      { ...referral, applicant2_first_name: "Charles", applicant2_last_name: "Babbage", applicant2_email: "cb@example.com" },
      { firmName: "Test Firm", issuedAt: ISSUED },
    );
    expect(d.signers).toHaveLength(2);
    expect(d.signers[1]).toEqual({ name: "Charles Babbage", email: "cb@example.com" });
  });

  /** An empty second slot is not a person, and must not become a signer who
   *  can never sign — the engine refuses a document not signed by everyone. */
  it("does not invent a signer from an empty second applicant", () => {
    const d = buildConsentDoc(referral, { firmName: "Test Firm", issuedAt: ISSUED });
    expect(d.signers).toHaveLength(1);
  });
});

describe("consentReadyToSend", () => {
  it("accepts a referral with a named applicant and an address", () => {
    const d = buildConsentDoc(referral, { firmName: "F", issuedAt: ISSUED });
    expect(consentReadyToSend(d)).toEqual({ ok: true });
  });

  /**
   * Issuing a form to someone with no address creates a document that can never
   * reach "signed by everyone asked" — which blocks the submit forever and
   * looks like the client being slow. Refuse it up front and say why.
   */
  it("refuses when a signer has no email, and names them", () => {
    const d = buildConsentDoc(
      { ...referral, applicant2_first_name: "Charles", applicant2_last_name: "Babbage" },
      { firmName: "F", issuedAt: ISSUED },
    );
    const r = consentReadyToSend(d);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("Charles Babbage");
      expect(r.reason).toContain("paper");
    }
  });

  it("refuses a referral with no name on it at all", () => {
    const d = buildConsentDoc({}, { firmName: "F", issuedAt: ISSUED });
    expect(consentReadyToSend(d).ok).toBe(false);
  });
});

describe("hydrateConsentDoc", () => {
  /**
   * THE ONE THAT MATTERS. CONSENT_STATEMENT names the whole disclosure chain. If
   * that chain changes, someone who signed the old wording consented to the old
   * chain — so a stored statement must always win over today's constant.
   */
  it("keeps a stored statement even when the constant has moved on", () => {
    const d = hydrateConsentDoc({ consent_statement: "An older wording that named fewer parties." });
    expect(d.consent_statement).toBe("An older wording that named fewer parties.");
    expect(d.consent_statement).not.toBe(CONSENT_STATEMENT);
  });

  it("falls back to the current wording only when the row carries none", () => {
    expect(hydrateConsentDoc({}).consent_statement).toBe(CONSENT_STATEMENT);
  });

  it("opens a malformed or empty blob without throwing", () => {
    expect(() => hydrateConsentDoc(null)).not.toThrow();
    expect(hydrateConsentDoc({ signers: "nope" }).signers).toEqual([]);
  });
});

describe("the signature engine knows about it", () => {
  it("is signable and has a client-facing label", () => {
    expect(SIGN_DOC_TYPES).toContain("referral_consent");
    expect(DOC_TYPE_LABEL.referral_consent).toBe("Referral Consent and Privacy Form");
  });

  /** markDocSigned reads this to decide what "signed" means for the document. */
  it("has a terminal status the engine can write", () => {
    expect(LOCKED_STATUS.referral_consent).toBe("Signed");
  });
});

describe("the rendered form", () => {
  it("shows the wording the client is agreeing to", async () => {
    const d = buildConsentDoc(referral, { firmName: "Test Firm", issuedAt: ISSUED });
    const html = await renderReferralConsentHtml(d);
    expect(html).toContain("Referral Consent and Privacy Form");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("Test Firm");
    // The independence and fee disclosures are the two things the introducer
    // must have said out loud; the form repeats them in writing.
    expect(html).toContain("independent introducer");
    expect(html).toContain("may be paid a fee");
  });

  it("renders the STORED wording, not the current constant", async () => {
    const d = hydrateConsentDoc({
      ...buildConsentDoc(referral, { firmName: "F", issuedAt: ISSUED }),
      consent_statement: "OLD WORDING MARKER",
    });
    const html = await renderReferralConsentHtml(d);
    expect(html).toContain("OLD WORDING MARKER");
  });

  it("gives every applicant their own signature block", async () => {
    const d = buildConsentDoc(
      { ...referral, applicant2_first_name: "Charles", applicant2_last_name: "Babbage", applicant2_email: "cb@example.com" },
      { firmName: "F", issuedAt: ISSUED },
    );
    const html = await renderReferralConsentHtml(d);
    expect(html).toContain("Signed by applicant 1");
    expect(html).toContain("Signed by applicant 2");
  });

  it("escapes what the introducer typed rather than rendering it as markup", async () => {
    const d = buildConsentDoc(
      { ...referral, first_name: "<script>alert(1)</script>", last_name: "X" },
      { firmName: "F", issuedAt: ISSUED },
    );
    const html = await renderReferralConsentHtml(d);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("bakes in a captured signature when there is one", async () => {
    const d = buildConsentDoc(referral, { firmName: "F", issuedAt: ISSUED });
    const html = await renderReferralConsentHtml(d, [
      { name: "Ada Lovelace", date: "21 August 2026", image: "data:image/png;base64,AAA" },
    ]);
    expect(html).toContain("data:image/png;base64,AAA");
    expect(html).toContain("21 August 2026");
  });
});

describe("summary and signers", () => {
  it("summarises by the people signing", () => {
    const d = buildConsentDoc(
      { ...referral, applicant2_first_name: "Charles", applicant2_last_name: "Babbage" },
      { firmName: "F", issuedAt: ISSUED },
    );
    expect(consentDocSummary(d)).toBe("Ada Lovelace & Charles Babbage");
  });

  it("falls back to the reference when nobody is named", () => {
    expect(consentDocSummary(hydrateConsentDoc({ client_ref: "NKI-1" }))).toBe("NKI-1");
  });

  it("proposes exactly the signers on the document", () => {
    const d = buildConsentDoc(referral, { firmName: "F", issuedAt: ISSUED });
    expect(consentProposedSigners(d)).toEqual([{ name: "Ada Lovelace", email: "ada@example.com" }]);
  });
});
