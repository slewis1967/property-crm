import { describe, it, expect } from "vitest";
import { emptyNeedsAnalysis, type Applicant } from "./needsAnalysis";
import { applicantToContactRecord, applicantHasIdentity } from "./needsAnalysisToContact";

/** A blank applicant to mutate (emptyApplicant isn't exported). */
function blankApplicant(): Applicant {
  return emptyNeedsAnalysis().applicants[1];
}

function populatedApplicant(): Applicant {
  const a = blankApplicant();
  a.title = "Mrs";
  a.given_names = "Jane Marie";
  a.surname = "Halliday";
  a.dob = "1988-04-12";
  a.marital_status = "married";
  a.dependents_count = 2;
  a.contact.mobile_phone = "0412 000 111";
  a.contact.home_phone = "07 3000 0000";
  a.contact.email = "Jane.Halliday@Example.com";
  a.current_address.street = "12 Smith St";
  a.current_address.suburb = "Toowong";
  a.current_address.state = "QLD";
  a.current_address.postcode = "4066";
  a.current_employment.occupation = "Nurse";
  a.current_employment.income_amount = 1500;
  a.current_employment.pay_frequency = "wk";
  return a;
}

describe("applicantHasIdentity", () => {
  it("is false for a blank applicant", () => {
    expect(applicantHasIdentity(blankApplicant())).toBe(false);
  });
  it("is true with only a given name", () => {
    const a = blankApplicant();
    a.given_names = "David";
    expect(applicantHasIdentity(a)).toBe(true);
  });
  it("is true with only a surname", () => {
    const a = blankApplicant();
    a.surname = "Halliday";
    expect(applicantHasIdentity(a)).toBe(true);
  });
});

describe("applicantToContactRecord", () => {
  it("maps every populated field onto contact columns", () => {
    const rec = applicantToContactRecord(populatedApplicant());
    expect(rec).toEqual({
      full_name: "Jane Marie Halliday",
      name: "Jane Marie Halliday",
      first_name: "Jane Marie",
      email: "jane.halliday@example.com", // lower-cased
      phone: "0412 000 111", // mobile preferred over home
      date_of_birth: "1988-04-12",
      marital_status: "married",
      dependents_count: 2,
      home_address_street: "12 Smith St",
      home_address_suburb: "Toowong",
      home_address_state: "QLD",
      home_address_postcode: "4066",
      occupation: "Nurse",
      annual_income: 78_000, // 1500/wk × 52
    });
  });

  it("omits blank fields entirely (never writes empty strings)", () => {
    const a = blankApplicant();
    a.given_names = "David";
    a.surname = "Halliday";
    const rec = applicantToContactRecord(a);
    expect(rec).toEqual({
      full_name: "David Halliday",
      name: "David Halliday",
      first_name: "David",
    });
    // No empty-string keys that would blank an existing contact on merge.
    expect(Object.values(rec).every((v) => v !== "")).toBe(true);
  });

  it("annualises each pay frequency", () => {
    const mk = (amount: number, freq: string) => {
      const a = blankApplicant();
      a.given_names = "X";
      a.current_employment.income_amount = amount;
      a.current_employment.pay_frequency = freq;
      return applicantToContactRecord(a).annual_income;
    };
    expect(mk(1000, "wk")).toBe(52_000);
    expect(mk(2000, "fn")).toBe(52_000);
    expect(mk(5000, "m")).toBe(60_000);
    expect(mk(90_000, "pa")).toBe(90_000);
  });

  it("falls back to home then work phone when no mobile", () => {
    const a = blankApplicant();
    a.given_names = "X";
    a.contact.home_phone = "07 1111 1111";
    a.contact.work_phone = "07 2222 2222";
    expect(applicantToContactRecord(a).phone).toBe("07 1111 1111");

    const b = blankApplicant();
    b.given_names = "X";
    b.contact.work_phone = "07 2222 2222";
    expect(applicantToContactRecord(b).phone).toBe("07 2222 2222");
  });

  it("keeps dependents_count of 0 (a real value, not a blank)", () => {
    const a = blankApplicant();
    a.given_names = "X";
    a.dependents_count = 0;
    expect(applicantToContactRecord(a).dependents_count).toBe(0);
  });
});
