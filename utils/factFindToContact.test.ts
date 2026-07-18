import { describe, it, expect } from "vitest";
import { emptyFactFind, type Applicant } from "./factfind";
import { factFindApplicantToContactRecord, factFindApplicantHasIdentity } from "./factFindToContact";

/** A blank Fact Find applicant to mutate. */
function blankApplicant(): Applicant {
  return emptyFactFind().applicants[1];
}

function populatedApplicant(): Applicant {
  const a = blankApplicant();
  a.title = "Mrs";
  a.given_names = "Jane Marie";
  a.family_name = "Halliday";
  a.email = "Jane.Halliday@Example.com";
  a.phone_home = "07 3000 0000";
  a.phone_work = "07 4000 0000";
  a.date_of_birth = "1988-04-12";
  a.address = "12 Smith St, Toowong QLD";
  a.postcode = "4066";
  a.occupation = "Nurse";
  a.annual_income = 82_000;
  a.has_hecs = true;
  a.hecs_balance = 15_000;
  return a;
}

describe("factFindApplicantHasIdentity", () => {
  it("is false for a blank applicant", () => {
    expect(factFindApplicantHasIdentity(blankApplicant())).toBe(false);
  });
  it("is true with a name", () => {
    const a = blankApplicant();
    a.family_name = "Halliday";
    expect(factFindApplicantHasIdentity(a)).toBe(true);
  });
});

describe("factFindApplicantToContactRecord", () => {
  it("maps every populated field onto contact columns", () => {
    expect(factFindApplicantToContactRecord(populatedApplicant())).toEqual({
      full_name: "Jane Marie Halliday",
      name: "Jane Marie Halliday",
      first_name: "Jane Marie",
      email: "jane.halliday@example.com", // lower-cased
      phone: "07 3000 0000", // home preferred over work
      date_of_birth: "1988-04-12",
      home_address_street: "12 Smith St, Toowong QLD", // whole free-text line
      home_address_postcode: "4066",
      occupation: "Nurse",
      annual_income: 82_000, // already annual — passed through
      hecs_balance: 15_000,
    });
  });

  it("omits blank fields entirely (never writes empty strings)", () => {
    const a = blankApplicant();
    a.given_names = "David";
    a.family_name = "Halliday";
    const rec = factFindApplicantToContactRecord(a);
    expect(rec).toEqual({
      full_name: "David Halliday",
      name: "David Halliday",
      first_name: "David",
    });
    expect(Object.values(rec).every((v) => v !== "")).toBe(true);
  });

  it("falls back to work phone when no home phone", () => {
    const a = blankApplicant();
    a.given_names = "X";
    a.phone_work = "07 4000 0000";
    expect(factFindApplicantToContactRecord(a).phone).toBe("07 4000 0000");
  });

  it("does not fabricate income/hecs when null", () => {
    const a = blankApplicant();
    a.given_names = "X";
    const rec = factFindApplicantToContactRecord(a);
    expect("annual_income" in rec).toBe(false);
    expect("hecs_balance" in rec).toBe(false);
  });
});
