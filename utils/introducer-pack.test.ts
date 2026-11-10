import { describe, it, expect } from "vitest";
import {
  canSendFullPack,
  isPackType,
  packApplicantCount,
  packApplicantEmail,
  packApplicantName,
  packStarted,
  packSubmitBlockers,
  seedNeedsAnalysisFromReferral,
  toPortalView,
} from "./introducer";
import { emptyNeedsAnalysis, hydrateNeedsAnalysis, type NeedsAnalysisData } from "./needsAnalysis";

/**
 * The Tier 2 pack's own promises, pinned.
 *
 * A pack skips the super-admin accept gate, so these functions are no longer
 * "validation" in the ordinary sense — they are the last thing between an
 * introducer and a live CRM opportunity, an email to a member of the public, and
 * a compliance document that person then signs.
 *
 *   canSendFullPack     must default DOWN. Anything unrecognised is Tier 1.
 *   packSubmitBlockers  must be non-empty for anything short of a finished
 *                       Needs Analysis, because nobody downstream gets to send
 *                       it back.
 *   toPortalView        must still not leak the document it now knows about.
 */

/** A Needs Analysis with everything the submit gate asks for. */
function completePack(second = false): NeedsAnalysisData {
  const d = emptyNeedsAnalysis();
  d.interview_type = "face_to_face";
  d.needs_objectives = "Buy a first home in the next six months.";
  d.loan_amount_sought = 640_000;

  const a = d.applicants[0];
  a.given_names = "David";
  a.surname = "Halliday";
  a.dob = "1984-03-02";
  a.current_address.street = "12 Bay Village Rd";
  a.contact.email = "david@example.com";
  a.current_employment.employment_type = "payg";
  a.current_employment.income_amount = 3_000;
  a.current_employment.pay_frequency = "fn";
  a.current_employment.occupation = "Retail assistant";

  if (second) {
    const b = d.applicants[1];
    b.given_names = "Jane";
    b.surname = "Halliday";
    b.dob = "1986-07-11";
    b.current_address.street = "12 Bay Village Rd";
    b.contact.email = "jane@example.com";
    b.current_employment.employment_type = "payg";
    b.current_employment.income_amount = 2_000;
    b.current_employment.pay_frequency = "fn";
    b.current_employment.occupation = "Nurse";
  }
  return d;
}

describe("canSendFullPack", () => {
  it("is true only for t2", () => {
    expect(canSendFullPack("t2")).toBe(true);
    expect(canSendFullPack("t1")).toBe(false);
  });

  /**
   * The direction that matters. Every firm activated before `introducers.tier`
   * existed carries NULL, and a firm whose tier didn't come back on the narrow
   * rung of the session select carries undefined. Reading either as Tier 2
   * would hand the wider authority to the entire back catalogue at once.
   */
  it("defaults DOWN for anything unrecognised", () => {
    for (const v of [null, undefined, "", "T2", "t3", "tier2"]) {
      expect(canSendFullPack(v)).toBe(false);
    }
  });
});

describe("isPackType", () => {
  it("accepts only the two the CHECK constraint allows", () => {
    expect(isPackType("referral")).toBe(true);
    expect(isPackType("full")).toBe(true);
    expect(isPackType("t2")).toBe(false);
    expect(isPackType(null)).toBe(false);
  });
});

describe("seedNeedsAnalysisFromReferral", () => {
  it("carries the details that mean the same thing on both sides", () => {
    const d = seedNeedsAnalysisFromReferral({
      first_name: "David",
      last_name: "Halliday",
      email: "david@example.com",
      phone: "0400 000 000",
      dob: "1984-03-02",
      suburb: "Bateau Bay",
      state: "NSW",
      postcode: "2261",
      applicant2_first_name: "Jane",
      applicant2_last_name: "Halliday",
    });
    expect(d.applicants[0].given_names).toBe("David");
    expect(d.applicants[0].surname).toBe("Halliday");
    expect(d.applicants[0].contact.email).toBe("david@example.com");
    expect(d.applicants[0].dob).toBe("1984-03-02");
    expect(d.applicants[0].current_address.suburb).toBe("Bateau Bay");
    expect(d.applicants[0].current_address.state).toBe("NSW");
    expect(d.applicants[1].given_names).toBe("Jane");
  });

  /**
   * Income is a BAND on a referral and a NUMBER on the Needs Analysis.
   * Converting one to the other invents precision the client never gave — and
   * the income reconciliation would then compare their payslips against our
   * invention, in a document they have signed.
   */
  it("does not invent an income figure from an income band", () => {
    const d = seedNeedsAnalysisFromReferral({ income_band: "$90,000 – $120,000" });
    expect(d.applicants[0].current_employment.income_amount).toBeNull();
  });

  it("copes with a referral that has nothing in it", () => {
    expect(() => seedNeedsAnalysisFromReferral({})).not.toThrow();
  });
});

describe("packSubmitBlockers", () => {
  it("is empty only for a finished Needs Analysis", () => {
    expect(packSubmitBlockers(completePack())).toEqual([]);
    expect(packSubmitBlockers(completePack(true))).toEqual([]);
  });

  it("refuses an empty blob", () => {
    expect(packSubmitBlockers({}).length).toBeGreaterThan(0);
    expect(packSubmitBlockers(null).length).toBeGreaterThan(0);
  });

  /**
   * INCOME AND EMPLOYMENT ARE GATED HERE AND NOT ON THE STAFF FORM. They are
   * what the income reconciliation triangulates against the client's payslips
   * and ATO statements. Without them a pack sails past the one check that
   * exists because a file went out declaring $186k against payslips worth
   * $154k — and a pack is the submission least able to afford that, since no
   * human approved it.
   */
  it("demands income, frequency and employment type", () => {
    const d = completePack();
    d.applicants[0].current_employment.income_amount = null;
    d.applicants[0].current_employment.pay_frequency = "";
    const blockers = packSubmitBlockers(d);
    expect(blockers).toContain("Applicant 1 income");
    expect(blockers).toContain("Applicant 1 pay frequency");
  });

  /**
   * Someone not working has no income to declare, and demanding one would
   * invite a made-up number into a document the client signs.
   */
  it("does not demand income from someone who isn't working", () => {
    const d = completePack();
    d.applicants[0].current_employment.employment_type = "retired";
    d.applicants[0].current_employment.income_amount = null;
    d.applicants[0].current_employment.pay_frequency = "";
    const blockers = packSubmitBlockers(d);
    expect(blockers).not.toContain("Applicant 1 income");
    expect(blockers).not.toContain("Applicant 1 pay frequency");
  });

  /** Every applicant is emailed the document to sign and their upload link. */
  it("demands an email for each applicant in use", () => {
    const d = completePack(true);
    d.applicants[1].contact.email = "";
    expect(packSubmitBlockers(d).join(" ")).toMatch(/Applicant 2 email/);
  });

  it("holds a second applicant to the same standard once they exist", () => {
    const d = completePack(true);
    d.applicants[1].dob = "";
    expect(packSubmitBlockers(d)).toContain("Applicant 2 date of birth");
  });

  it("does not report the same gap twice when both lists catch it", () => {
    const d = completePack();
    d.applicants[0].dob = "";
    expect(packSubmitBlockers(d).filter((b) => b === "Applicant 1 date of birth")).toHaveLength(1);
  });

  it("names the interview and the objectives, which the assessor reads first", () => {
    const d = completePack();
    d.interview_type = "";
    d.needs_objectives = "";
    const blockers = packSubmitBlockers(d);
    expect(blockers).toContain("Interview type");
    expect(blockers).toContain("Needs & objectives");
  });
});

describe("packStarted", () => {
  /**
   * `needs_analysis_data` defaults to '{}' and hydrates into a fully-shaped
   * empty template, so "has this been started" cannot be answered by looking
   * for keys.
   */
  it("reads an empty or hydrated-empty blob as not started", () => {
    expect(packStarted({})).toBe(false);
    expect(packStarted(null)).toBe(false);
    expect(packStarted(emptyNeedsAnalysis())).toBe(false);
    expect(packStarted(hydrateNeedsAnalysis({}))).toBe(false);
  });

  it("reads a named applicant as started", () => {
    const d = emptyNeedsAnalysis();
    d.applicants[0].given_names = "David";
    expect(packStarted(d)).toBe(true);
  });
});

describe("who the pack is for", () => {
  it("is one applicant until the second has a name", () => {
    expect(packApplicantCount(completePack())).toBe(1);
    expect(packApplicantName(completePack(), 0)).toBe("David Halliday");
    expect(packApplicantEmail(completePack(), 0)).toBe("david@example.com");
  });

  /**
   * Each applicant needs their own link and their own signature —
   * yla-package.ts refuses a document not signed by everyone asked.
   */
  it("is both once the second one exists", () => {
    const d = completePack(true);
    expect(packApplicantCount(d)).toBe(2);
    expect(packApplicantEmail(d, 1)).toBe("jane@example.com");
  });

  it("returns empty strings rather than throwing on an unused applicant", () => {
    expect(packApplicantName(completePack(), 1)).toBe("");
    expect(packApplicantEmail(completePack(), 1)).toBe("");
  });

  it("survives a blob that predates the pack entirely", () => {
    expect(packApplicantCount({})).toBe(1);
  });
});

describe("toPortalView with a pack", () => {
  /**
   * The whitelist must not have grown by accident. `needs_analysis_data` is the
   * client's entire financial position AND the document they sign; it is
   * fetched by its own route and belongs in no list payload.
   */
  it("reports the pack's state without carrying the document", () => {
    const d = emptyNeedsAnalysis();
    d.applicants[0].given_names = "David";
    const view = toPortalView({
      id: "abc",
      status: "accepted",
      pack_type: "full",
      needs_analysis_data: d,
      needs_analysis_id: "na-1",
      document_request_id: "dr-1",
      contact_id: "c-1",
      decision_reason: "internal only",
    });
    expect(view.pack_type).toBe("full");
    expect(view.pack_started).toBe(true);
    expect(view.needs_analysis_created).toBe(true);
    expect(view.documents_requested).toBe(true);
    expect(view).not.toHaveProperty("needs_analysis_data");
    expect(view).not.toHaveProperty("needs_analysis_id");
    expect(view).not.toHaveProperty("contact_id");
    expect(view).not.toHaveProperty("decision_reason");
  });

  it("reads a row with no pack columns as an ordinary referral", () => {
    const view = toPortalView({ id: "abc", status: "draft" });
    expect(view.pack_type).toBe("referral");
    expect(view.pack_started).toBe(false);
    expect(view.needs_analysis_created).toBe(false);
  });

  it("refuses to promote an unrecognised pack_type", () => {
    expect(toPortalView({ id: "abc", status: "draft", pack_type: "premium" }).pack_type).toBe(
      "referral",
    );
  });
});
