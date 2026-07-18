import { describe, it, expect } from "vitest";
import { emptyFactFind, type FactFindData } from "./factfind";
import { factFindToCreditAuth } from "./factFindToCreditAuth";
import { emptyCreditAuthorisation } from "./creditAuthorisation";

function twoApplicants(): FactFindData {
  const ff = emptyFactFind();
  ff.applicants[0].given_names = "David";
  ff.applicants[0].family_name = "Halliday";
  ff.applicants[0].address = "12 Smith St, Toowong QLD";
  ff.applicants[0].postcode = "4066";
  ff.applicants[1].given_names = "Jane";
  ff.applicants[1].family_name = "Halliday";
  return ff;
}

describe("factFindToCreditAuth", () => {
  it("joins both applicants' names and takes Applicant 1's address", () => {
    const ca = factFindToCreditAuth(twoApplicants());
    expect(ca.names).toBe("David Halliday & Jane Halliday");
    expect(ca.address).toBe("12 Smith St, Toowong QLD, 4066");
  });

  it("keeps a single applicant to one name", () => {
    const ff = emptyFactFind();
    ff.applicants[0].given_names = "David";
    ff.applicants[0].family_name = "Halliday";
    const ca = factFindToCreditAuth(ff);
    expect(ca.names).toBe("David Halliday");
    expect(ca.address).toBe("");
  });

  it("falls back to Applicant 2's address when Applicant 1 has none", () => {
    const ff = twoApplicants();
    ff.applicants[0].address = "";
    ff.applicants[0].postcode = "";
    ff.applicants[1].address = "9 Baker Rd, Ipswich QLD";
    ff.applicants[1].postcode = "4305";
    expect(factFindToCreditAuth(ff).address).toBe("9 Baker Rd, Ipswich QLD, 4305");
  });

  it("returns an otherwise-empty credit authorisation (fixed fields untouched)", () => {
    const ca = factFindToCreditAuth(emptyFactFind());
    const blank = emptyCreditAuthorisation();
    expect(ca.names).toBe("");
    expect(ca.address).toBe("");
    expect(ca.status).toBe(blank.status);
    expect(ca.signatories).toEqual(blank.signatories);
  });
});
