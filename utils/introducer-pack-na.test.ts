import { describe, it, expect } from "vitest";
import { toPortalView, packApplicantCount, packApplicantEmail, packApplicantName } from "./introducer";
import { emptyFactFind } from "./factfind";
import { factFindToNeedsAnalysis } from "./factFindToNeedsAnalysis";
import { applicantSummary as naApplicantSummary, hydrateNeedsAnalysis } from "./needsAnalysis";

/**
 * The Needs Analysis a Tier 2 pack produces.
 *
 * WHY THE DOCUMENT MATTERS. utils/yla-package.ts: "YLA do not receive a Fact
 * Find — they receive a Needs Analysis" (Sean, 2026-07-25). It resolves that
 * document by `contact_id` and demands the terminal status WITH captured
 * signatures. So a pack that produced only a fact find dead-ended at the YLA
 * submission, after the client had already uploaded everything.
 *
 * These pin the derivation the submit path relies on — that the bridge yields a
 * Needs Analysis with the figures and the people on it, and that the signer list
 * matches the applicants who actually exist.
 */

function pack(second = false) {
  const ff = emptyFactFind();
  ff.applicants[0].given_names = "David";
  ff.applicants[0].family_name = "Halliday";
  ff.applicants[0].email = "david@example.com";
  ff.applicants[0].date_of_birth = "1984-03-02";
  ff.applicants[0].address = "12 Bay Village Rd, Bateau Bay NSW";
  ff.applicants[0].annual_income = 186_000;
  ff.loan.amount_required = 640_000;
  ff.loan.purpose = "Purchase of an owner-occupied home";
  if (second) {
    ff.applicants[1].given_names = "Jane";
    ff.applicants[1].family_name = "Halliday";
    ff.applicants[1].email = "jane@example.com";
  }
  return ff;
}

describe("the Needs Analysis derived from a pack", () => {
  it("carries the loan amount the list view and YLA both key on", () => {
    const { data } = factFindToNeedsAnalysis(pack());
    expect(data.loan_amount_sought).toBe(640_000);
  });

  it("carries the applicants, so the document is about somebody", () => {
    const { data } = factFindToNeedsAnalysis(pack(true));
    expect(naApplicantSummary(data)).toContain("Halliday");
    expect(data.applicants[0].given_names).toBe("David");
    expect(data.applicants[1].given_names).toBe("Jane");
  });

  /**
   * The mapping is a REVIEWABLE draft, not a finished document — the bridge is
   * explicit that "a wrong carried-over value is worse than a blank one". The
   * notes are the record of every assumption, and the submit path stores them on
   * the audit entry so an assessor inherits them rather than silent guesses.
   */
  it("returns review notes rather than guessing silently", () => {
    const { notes } = factFindToNeedsAnalysis(pack());
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(" ")).toMatch(/income carried as gross annual/i);
  });

  it("survives round-tripping through the hydrator the way the row will", () => {
    const { data } = factFindToNeedsAnalysis(pack(true));
    const rehydrated = hydrateNeedsAnalysis(JSON.parse(JSON.stringify(data)));
    expect(rehydrated.loan_amount_sought).toBe(640_000);
    expect(rehydrated.applicants[1].surname).toBe("Halliday");
  });
});

describe("who is asked to sign it", () => {
  /**
   * Every applicant signs, and each needs their own address. yla-package.ts
   * refuses a document that is not signed by everyone asked, so a solo pack must
   * produce exactly one signer — an empty second slot must not become a request
   * to a blank address that can never be satisfied.
   */
  it("is one signer for a solo applicant", () => {
    const ff = pack();
    expect(packApplicantCount(ff)).toBe(1);
    expect(packApplicantName(ff, 0)).toBe("David Halliday");
    expect(packApplicantEmail(ff, 0)).toBe("david@example.com");
  });

  it("is both applicants once the second one exists", () => {
    const ff = pack(true);
    expect(packApplicantCount(ff)).toBe(2);
    expect(packApplicantEmail(ff, 1)).toBe("jane@example.com");
  });

  /**
   * A second applicant with a name but no email. The submit path reports this
   * rather than sending a partial request, because a Needs Analysis signed by
   * one of two people is refused by the packager — it would look sent and be
   * unusable.
   */
  it("exposes a named applicant with no address, so it can be refused", () => {
    const ff = pack(true);
    ff.applicants[1].email = "";
    expect(packApplicantCount(ff)).toBe(2);
    expect(packApplicantName(ff, 1)).toBe("Jane Halliday");
    expect(packApplicantEmail(ff, 1)).toBe("");
  });
});

describe("toPortalView and the Needs Analysis", () => {
  it("says one exists without leaking its id or contents", () => {
    const view = toPortalView({
      id: "abc",
      status: "accepted",
      pack_type: "full",
      needs_analysis_id: "na-1",
      contact_id: "c-1",
    });
    expect(view.needs_analysis_created).toBe(true);
    expect(view).not.toHaveProperty("needs_analysis_id");
    expect(view).not.toHaveProperty("contact_id");
  });

  it("reports none for a pack that predates this", () => {
    const view = toPortalView({ id: "abc", status: "accepted", pack_type: "full" });
    expect(view.needs_analysis_created).toBe(false);
  });
});
