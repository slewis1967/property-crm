import { describe, it, expect } from "vitest";
import { emptyNeedsAnalysis } from "./needsAnalysis";
import { emptyFactFind, factFindCompletionBlockers } from "./factfind";
import { needsAnalysisToFactFind, mergeSeededApplicant } from "./needsAnalysisToFactFind";

function naWithDavid() {
  const na = emptyNeedsAnalysis();
  const a = na.applicants[0];
  a.title = "Mr";
  a.surname = "Halliday";
  a.given_names = "David William";
  a.dob = "1972-02-19";
  a.current_address.street = "5 Green Plateau Road";
  a.current_address.suburb = "Springfield";
  a.current_address.state = "NSW";
  a.current_address.postcode = "2250";
  a.contact.mobile_phone = "0435167609";
  a.contact.email = "dha74488@gmail.com";
  a.additional.id_document = "DL 6697EE";
  a.current_employment.occupation = "Mobile Speed Camera";
  a.current_employment.income_amount = 120000;
  return na;
}

describe("needsAnalysisToFactFind", () => {
  it("maps identity/contact/address/employment, only for applicants in use", () => {
    const { applicants, notes } = needsAnalysisToFactFind(naWithDavid());
    expect(applicants).toHaveLength(1); // second NA slot is empty → dropped
    const d = applicants[0];
    expect(d.family_name).toBe("Halliday");
    expect(d.given_names).toBe("David William");
    expect(d.date_of_birth).toBe("1972-02-19");
    expect(d.address).toBe("5 Green Plateau Road, Springfield, NSW");
    expect(d.postcode).toBe("2250");
    expect(d.phone_home).toBe("0435167609");
    expect(d.drivers_licence).toBe("6697EE"); // "DL " stripped
    expect(d.occupation).toBe("Mobile Speed Camera");
    expect(d.annual_income).toBe(120000);
    expect(notes.length).toBeGreaterThan(0);
  });

  it("returns no applicants for an empty Needs Analysis", () => {
    expect(needsAnalysisToFactFind(emptyNeedsAnalysis()).applicants).toHaveLength(0);
  });
});

describe("mergeSeededApplicant", () => {
  it("fills empty fields but never overwrites existing values", () => {
    const existing = { ...emptyFactFind().applicants[0], given_names: "Dave", email: "keep@me.com" };
    const seeded = needsAnalysisToFactFind(naWithDavid()).applicants[0];
    const merged = mergeSeededApplicant(existing, seeded);
    expect(merged.given_names).toBe("Dave"); // existing wins
    expect(merged.email).toBe("keep@me.com"); // existing wins
    expect(merged.date_of_birth).toBe("1972-02-19"); // filled from seed
    expect(merged.address).toBe("5 Green Plateau Road, Springfield, NSW"); // filled from seed
  });
});

describe("factFindCompletionBlockers", () => {
  it("blocks a stub: name only, no DOB/address (the bug that let a blank fact find sign)", () => {
    const d = emptyFactFind();
    d.applicants[0].given_names = "David";
    d.applicants[0].family_name = "Halliday";
    const blockers = factFindCompletionBlockers(d);
    expect(blockers).toContain("Applicant 1 date of birth");
    expect(blockers).toContain("Applicant 1 residential address");
  });

  it("passes once name + DOB + address are present; ignores an empty 2nd slot", () => {
    const d = emptyFactFind();
    Object.assign(d.applicants[0], {
      given_names: "David",
      family_name: "Halliday",
      date_of_birth: "1972-02-19",
      address: "5 Green Plateau Road, Springfield NSW",
    });
    expect(factFindCompletionBlockers(d)).toEqual([]);
  });

  it("blocks when a second applicant is partially filled but missing DOB/address", () => {
    const d = emptyFactFind();
    Object.assign(d.applicants[0], {
      given_names: "David", family_name: "Halliday", date_of_birth: "1972-02-19", address: "x",
    });
    d.applicants[1].given_names = "Melissa";
    d.applicants[1].family_name = "Halliday";
    const blockers = factFindCompletionBlockers(d);
    expect(blockers).toContain("Applicant 2 date of birth");
    expect(blockers).toContain("Applicant 2 residential address");
  });

  it("requires at least one applicant name", () => {
    expect(factFindCompletionBlockers(emptyFactFind())).toContain("At least one applicant's name");
  });
});
