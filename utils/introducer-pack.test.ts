import { describe, it, expect } from "vitest";
import {
  canSendFullPack,
  factFindStarted,
  factFindSubmitBlockers,
  isPackType,
  packApplicantCount,
  packApplicantEmail,
  packApplicantName,
  seedFactFindFromReferral,
  toPortalView,
} from "./introducer";
import { emptyFactFind, hydrateFactFind, type FactFindData } from "./factfind";

/**
 * The Tier 2 pack's own promises, pinned.
 *
 * A pack skips the super-admin accept gate, which means these functions are no
 * longer "validation" in the ordinary sense — they are the last thing between an
 * introducer and a live CRM opportunity plus an email to a member of the public.
 * Three of them carry that weight:
 *
 *   canSendFullPack       — must default DOWN. Anything unrecognised is Tier 1.
 *   factFindSubmitBlockers — must be non-empty for anything short of a finished
 *                            fact find, because nobody downstream gets to send
 *                            it back.
 *   toPortalView          — must still not leak the blob it now knows about.
 */

/** A fact find with everything `outstandingSections` and the hard gate want. */
function completeFactFind(): FactFindData {
  const d = emptyFactFind();
  d.applicants[0].given_names = "Ada";
  d.applicants[0].family_name = "Lovelace";
  d.applicants[0].date_of_birth = "1815-12-10";
  d.applicants[0].address = "12 Analytical St, Brisbane QLD";
  d.applicants[0].annual_income = 120_000;
  d.applicants[0].email = "ada@example.com";
  d.loan.amount_required = 600_000;
  d.loan.purpose = "Purchase of an owner-occupied home";
  d.loan.repayment_strategy = "Principal and interest from salary";
  d.securities[0].address = "9 Difference Rd, Brisbane";
  for (const key of Object.keys(d.disclosures)) d.disclosures[key].answer = "no";
  d.declarations.info_confirmed = true;
  d.declarations.privacy.acknowledged = true;
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
    expect(canSendFullPack(null)).toBe(false);
    expect(canSendFullPack(undefined)).toBe(false);
    expect(canSendFullPack("")).toBe(false);
    expect(canSendFullPack("T2")).toBe(false);
    expect(canSendFullPack("t3")).toBe(false);
    expect(canSendFullPack("tier2")).toBe(false);
  });
});

describe("isPackType", () => {
  it("accepts only the two the CHECK constraint allows", () => {
    expect(isPackType("referral")).toBe(true);
    expect(isPackType("full")).toBe(true);
    expect(isPackType("t2")).toBe(false);
    expect(isPackType(null)).toBe(false);
    expect(isPackType(undefined)).toBe(false);
  });
});

describe("seedFactFindFromReferral", () => {
  it("carries the details that mean the same thing on both sides", () => {
    const d = seedFactFindFromReferral({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "0400 000 000",
      dob: "1815-12-10",
      suburb: "Brisbane",
      state: "QLD",
      postcode: "4000",
      applicant2_first_name: "Charles",
      applicant2_last_name: "Babbage",
    });
    expect(d.applicants[0].given_names).toBe("Ada");
    expect(d.applicants[0].family_name).toBe("Lovelace");
    expect(d.applicants[0].email).toBe("ada@example.com");
    expect(d.applicants[0].date_of_birth).toBe("1815-12-10");
    expect(d.applicants[0].address).toBe("Brisbane, QLD");
    expect(d.applicants[1].given_names).toBe("Charles");
  });

  /**
   * Income is a BAND on a referral and a NUMBER on a fact find. Converting one
   * to the other invents precision the client never gave — and the capacity
   * engine would then treat the invention as declared income.
   */
  it("does not invent an income figure from an income band", () => {
    const d = seedFactFindFromReferral({ income_band: "$90,000 – $120,000" });
    expect(d.applicants[0].annual_income).toBeNull();
  });

  it("produces a blob a fresh referral can be seeded from without error", () => {
    expect(() => seedFactFindFromReferral({})).not.toThrow();
    expect(seedFactFindFromReferral({}).applicants).toHaveLength(2);
  });
});

describe("factFindSubmitBlockers", () => {
  it("is empty only for a finished fact find", () => {
    expect(factFindSubmitBlockers(completeFactFind())).toEqual([]);
  });

  it("refuses an empty blob", () => {
    expect(factFindSubmitBlockers({}).length).toBeGreaterThan(0);
    expect(factFindSubmitBlockers(null).length).toBeGreaterThan(0);
  });

  /**
   * The stub case. A pack with a name and nothing else must not slip through:
   * on the staff side `outstandingSections` is advisory because the file stays
   * open, but here submit is the end of the road.
   */
  it("refuses a stub carrying only a name", () => {
    const d = emptyFactFind();
    d.applicants[0].given_names = "Ada";
    d.applicants[0].family_name = "Lovelace";
    const blockers = factFindSubmitBlockers(d);
    expect(blockers).toContain("Applicant 1 date of birth");
    expect(blockers).toContain("Loan amount required");
  });

  it("names an unanswered disclosure rather than passing over it", () => {
    const d = completeFactFind();
    d.disclosures.bankruptcy.answer = null;
    expect(factFindSubmitBlockers(d)).toContain("All disclosure questions answered");
  });

  it("does not report the same gap twice when both lists catch it", () => {
    const d = completeFactFind();
    d.applicants[0].date_of_birth = "";
    const blockers = factFindSubmitBlockers(d);
    expect(blockers.filter((b) => b === "Applicant 1 date of birth")).toHaveLength(1);
  });

  it("holds a second applicant to the same standard once they exist", () => {
    const d = completeFactFind();
    d.applicants[1].given_names = "Charles";
    d.applicants[1].family_name = "Babbage";
    expect(factFindSubmitBlockers(d)).toContain("Applicant 2 date of birth");
  });
});

describe("factFindStarted", () => {
  /**
   * `fact_find_data` defaults to '{}' and hydrates into a fully-shaped empty
   * template, so "has this been started" cannot be answered by looking for keys.
   */
  it("reads an empty or hydrated-empty blob as not started", () => {
    expect(factFindStarted({})).toBe(false);
    expect(factFindStarted(null)).toBe(false);
    expect(factFindStarted(emptyFactFind())).toBe(false);
    expect(factFindStarted(hydrateFactFind({}))).toBe(false);
  });

  it("reads a named applicant as started", () => {
    const d = emptyFactFind();
    d.applicants[0].given_names = "Ada";
    expect(factFindStarted(d)).toBe(true);
  });
});

describe("packApplicantCount", () => {
  it("is 1 until the second applicant has a name", () => {
    expect(packApplicantCount(completeFactFind())).toBe(1);
  });

  it("is 2 once they do, so they get their own upload link", () => {
    const d = completeFactFind();
    d.applicants[1].family_name = "Babbage";
    expect(packApplicantCount(d)).toBe(2);
  });

  it("survives a blob that predates the fact find entirely", () => {
    expect(packApplicantCount({})).toBe(1);
  });
});

describe("packApplicantName / packApplicantEmail", () => {
  it("reads the fact find, which is authoritative by submit", () => {
    const d = completeFactFind();
    expect(packApplicantName(d, 0)).toBe("Ada Lovelace");
    expect(packApplicantEmail(d, 0)).toBe("ada@example.com");
  });

  it("returns empty strings rather than throwing on an unused applicant", () => {
    expect(packApplicantName(completeFactFind(), 1)).toBe("");
    expect(packApplicantEmail(completeFactFind(), 1)).toBe("");
  });
});

describe("toPortalView with a pack", () => {
  /**
   * The whitelist gained three fields and must not have gained a fourth by
   * accident. `fact_find_data` is the client's entire financial position; it is
   * fetched by the fact find's own route and belongs in no list payload.
   */
  it("reports that a fact find exists without carrying it", () => {
    const d = emptyFactFind();
    d.applicants[0].given_names = "Ada";
    const view = toPortalView({
      id: "abc",
      status: "draft",
      pack_type: "full",
      fact_find_data: d,
      document_request_id: "dr-1",
      // Internal columns that must still never surface.
      decision_reason: "internal only",
      fact_find_id: "ff-1",
    });
    expect(view.pack_type).toBe("full");
    expect(view.fact_find_started).toBe(true);
    expect(view.documents_requested).toBe(true);
    expect(view).not.toHaveProperty("fact_find_data");
    expect(view).not.toHaveProperty("fact_find_id");
    expect(view).not.toHaveProperty("decision_reason");
  });

  it("reads a row with no pack columns as an ordinary referral", () => {
    const view = toPortalView({ id: "abc", status: "draft" });
    expect(view.pack_type).toBe("referral");
    expect(view.fact_find_started).toBe(false);
    expect(view.documents_requested).toBe(false);
  });

  it("refuses to promote an unrecognised pack_type", () => {
    const view = toPortalView({ id: "abc", status: "draft", pack_type: "premium" });
    expect(view.pack_type).toBe("referral");
  });
});
