import { describe, it, expect } from "vitest";
import { emptyAmlCase } from "./aml";
import { amlToCreditAuth } from "./amlToCreditAuth";
import { emptyCreditAuthorisation } from "./creditAuthorisation";

describe("amlToCreditAuth", () => {
  it("names the acting individual + beneficial owners, with the residential address", () => {
    const data = emptyAmlCase("company");
    data.entity.fullLegalName = "Jane Director";
    data.entity.residentialAddress = {
      line1: "12 Smith St",
      suburb: "Toowong",
      state: "QLD",
      postcode: "4066",
      country: "Australia",
    };
    data.beneficialOwners = [
      { fullLegalName: "Bob Owner", dob: "1970-01-01", ownershipPercent: 40, role: "Director", verified: false },
      { fullLegalName: "Alice Owner", dob: "1972-02-02", ownershipPercent: 35, role: "Shareholder", verified: false },
    ];
    const ca = amlToCreditAuth(data);
    expect(ca.names).toBe("Jane Director & Bob Owner & Alice Owner");
    expect(ca.address).toBe("12 Smith St, Toowong, QLD, 4066");
    // Signers pre-fill the send modal by name (AML captures no emails).
    expect(ca.signers).toEqual([
      { name: "Jane Director", email: "" },
      { name: "Bob Owner", email: "" },
      { name: "Alice Owner", email: "" },
    ]);
  });

  it("uses just the person for an individual party (no beneficial owners)", () => {
    const data = emptyAmlCase("individual");
    data.entity.fullLegalName = "David Halliday";
    data.entity.residentialAddress = { line1: "9 Baker Rd", suburb: "Ipswich", state: "QLD", postcode: "4305", country: "Australia" };
    const ca = amlToCreditAuth(data);
    expect(ca.names).toBe("David Halliday");
    expect(ca.address).toBe("9 Baker Rd, Ipswich, QLD, 4305");
  });

  it("dedupes when the acting individual is also listed as a beneficial owner", () => {
    const data = emptyAmlCase("company");
    data.entity.fullLegalName = "Jane Director";
    data.beneficialOwners = [
      { fullLegalName: "Jane Director", dob: "1970-01-01", ownershipPercent: 100, role: "Director", verified: false },
    ];
    expect(amlToCreditAuth(data).names).toBe("Jane Director");
  });

  it("returns an otherwise-empty credit authorisation (fixed fields untouched)", () => {
    const ca = amlToCreditAuth(emptyAmlCase("individual"));
    const blank = emptyCreditAuthorisation();
    expect(ca.names).toBe("");
    expect(ca.address).toBe("");
    expect(ca.status).toBe(blank.status);
    expect(ca.signatories).toEqual(blank.signatories);
  });
});
