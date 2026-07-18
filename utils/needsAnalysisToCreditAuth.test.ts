import { describe, it, expect } from "vitest";
import { emptyNeedsAnalysis, type NeedsAnalysisData } from "./needsAnalysis";
import { needsAnalysisToCreditAuth } from "./needsAnalysisToCreditAuth";
import { emptyCreditAuthorisation } from "./creditAuthorisation";

function twoApplicants(): NeedsAnalysisData {
  const na = emptyNeedsAnalysis();
  na.applicants[0].given_names = "David";
  na.applicants[0].surname = "Halliday";
  na.applicants[0].current_address.street = "12 Smith St";
  na.applicants[0].current_address.suburb = "Toowong";
  na.applicants[0].current_address.state = "QLD";
  na.applicants[0].current_address.postcode = "4066";
  na.applicants[0].contact.email = "david@example.com";
  na.applicants[1].given_names = "Jane";
  na.applicants[1].surname = "Halliday";
  na.applicants[1].contact.email = "jane@example.com";
  return na;
}

describe("needsAnalysisToCreditAuth", () => {
  it("joins both applicants' names and takes Applicant 1's address", () => {
    const ca = needsAnalysisToCreditAuth(twoApplicants());
    expect(ca.names).toBe("David Halliday & Jane Halliday");
    expect(ca.address).toBe("12 Smith St, Toowong, QLD, 4066");
  });

  it("keeps a single applicant to one name", () => {
    const na = emptyNeedsAnalysis();
    na.applicants[0].given_names = "David";
    na.applicants[0].surname = "Halliday";
    const ca = needsAnalysisToCreditAuth(na);
    expect(ca.names).toBe("David Halliday");
    expect(ca.address).toBe("");
  });

  it("falls back to Applicant 2's address when Applicant 1 has none", () => {
    const na = twoApplicants();
    na.applicants[0].current_address = { ...na.applicants[0].current_address, street: "", suburb: "", state: "", postcode: "" };
    na.applicants[1].current_address.street = "9 Baker Rd";
    na.applicants[1].current_address.suburb = "Ipswich";
    const ca = needsAnalysisToCreditAuth(na);
    expect(ca.address).toBe("9 Baker Rd, Ipswich");
  });

  it("returns an otherwise-empty credit authorisation (fixed fields untouched)", () => {
    const ca = needsAnalysisToCreditAuth(emptyNeedsAnalysis());
    const blank = emptyCreditAuthorisation();
    expect(ca.names).toBe("");
    expect(ca.address).toBe("");
    expect(ca.status).toBe(blank.status);
    expect(ca.signatories).toEqual(blank.signatories);
    expect(ca.signers).toEqual([]);
  });

  it("carries both applicants as signers (name + email) for the send modal", () => {
    const ca = needsAnalysisToCreditAuth(twoApplicants());
    expect(ca.signers).toEqual([
      { name: "David Halliday", email: "david@example.com" },
      { name: "Jane Halliday", email: "jane@example.com" },
    ]);
  });

  it("keeps a signer with a name but no email, and drops fully-empty applicants", () => {
    const na = emptyNeedsAnalysis();
    na.applicants[0].given_names = "Solo";
    na.applicants[0].surname = "Applicant";
    // applicant 2 left blank
    expect(needsAnalysisToCreditAuth(na).signers).toEqual([{ name: "Solo Applicant", email: "" }]);
  });
});
