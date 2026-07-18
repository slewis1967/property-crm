import { describe, it, expect } from "vitest";
import { emptyFactFind } from "./factfind";
import { factFindToAmlCase } from "./factFindToAmlCase";
import { emptyAmlCase } from "./aml";

describe("factFindToAmlCase", () => {
  it("maps Applicant 1 onto an individual CDD case", () => {
    const ff = emptyFactFind();
    ff.applicants[0].given_names = "David John";
    ff.applicants[0].family_name = "Halliday";
    ff.applicants[0].date_of_birth = "1979-11-05";
    ff.applicants[0].address = "12 Smith St, Toowong QLD";
    ff.applicants[0].postcode = "4066";

    const data = factFindToAmlCase(ff);
    expect(data.partyType).toBe("individual");
    expect(data.entity.fullLegalName).toBe("David John Halliday");
    expect(data.entity.dob).toBe("1979-11-05");
    expect(data.entity.residentialAddress.line1).toBe("12 Smith St, Toowong QLD");
    expect(data.entity.residentialAddress.postcode).toBe("4066");
    // Country default preserved from the empty template.
    expect(data.entity.residentialAddress.country).toBe("Australia");
  });

  it("only maps Applicant 1 (a co-borrower gets a separate case)", () => {
    const ff = emptyFactFind();
    ff.applicants[0].given_names = "David";
    ff.applicants[0].family_name = "Halliday";
    ff.applicants[1].given_names = "Jane";
    ff.applicants[1].family_name = "Halliday";
    expect(factFindToAmlCase(ff).entity.fullLegalName).toBe("David Halliday");
  });

  it("leaves the case blank when Applicant 1 is empty (fields default)", () => {
    const data = factFindToAmlCase(emptyFactFind());
    const blank = emptyAmlCase("individual");
    expect(data.entity.fullLegalName).toBe("");
    expect(data.entity.dob).toBe("");
    expect(data.entity.residentialAddress).toEqual(blank.entity.residentialAddress);
  });
});
