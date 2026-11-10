import { describe, expect, it } from "vitest";
import { contactToApplicant, factFindFromContact, type FactFindContact } from "./factfind";

/** A richly-populated contact exercising every mapped field. */
const fullContact: FactFindContact = {
  name: "Janey Smith",
  full_name: "Jane Elizabeth Smith",
  first_name: "Jane",
  email: "jane@example.com",
  phone: "0400 000 000",
  date_of_birth: "1985-06-01",
  home_address_street: "12 Baker St",
  home_address_suburb: "Newtown",
  home_address_state: "NSW",
  home_address_postcode: "2042",
  occupation: "Nurse",
  annual_income: 95000,
  hecs_balance: 18000,
};

describe("contactToApplicant", () => {
  it("maps the corresponding fields conservatively", () => {
    const a = contactToApplicant(fullContact);
    expect(a.given_names).toBe("Jane Elizabeth");
    expect(a.family_name).toBe("Smith");
    expect(a.email).toBe("jane@example.com");
    expect(a.phone_home).toBe("0400 000 000");
    expect(a.date_of_birth).toBe("1985-06-01");
    expect(a.occupation).toBe("Nurse");
    expect(a.address).toBe("12 Baker St, Newtown, NSW");
    expect(a.postcode).toBe("2042");
    expect(a.annual_income).toBe(95000);
    expect(a.hecs_balance).toBe(18000);
    expect(a.has_hecs).toBe(true);
  });

  it("leaves unmapped fields at their empty-form default", () => {
    const a = contactToApplicant(fullContact);
    expect(a.title).toBe("");
    expect(a.capacity).toBe("");
    expect(a.phone_work).toBe("");
    expect(a.drivers_licence).toBe("");
  });

  it("falls back to `name` and splits a two-word name when full_name is absent", () => {
    const a = contactToApplicant({ name: "Bob Jones", email: "b@x.com" });
    expect(a.given_names).toBe("Bob");
    expect(a.family_name).toBe("Jones");
    expect(a.email).toBe("b@x.com");
  });

  it("uses a distinct first_name as the given name for a single-token full name", () => {
    const a = contactToApplicant({ full_name: "Smith", first_name: "John" });
    expect(a.given_names).toBe("John");
    expect(a.family_name).toBe("Smith");
  });

  it("keeps a lone single-token name as the given name with a blank surname", () => {
    const a = contactToApplicant({ full_name: "Madonna" });
    expect(a.given_names).toBe("Madonna");
    expect(a.family_name).toBe("");
  });

  it("treats null/empty contact fields as empty strings and no HECS", () => {
    const a = contactToApplicant({
      name: null,
      email: null,
      phone: null,
      annual_income: null,
      hecs_balance: null,
    });
    expect(a.given_names).toBe("");
    expect(a.family_name).toBe("");
    expect(a.email).toBe("");
    expect(a.phone_home).toBe("");
    expect(a.annual_income).toBeNull();
    expect(a.hecs_balance).toBeNull();
    expect(a.has_hecs).toBe(false);
  });

  it("does not set has_hecs when the balance is zero", () => {
    const a = contactToApplicant({ name: "Z", hecs_balance: 0 });
    expect(a.hecs_balance).toBe(0);
    expect(a.has_hecs).toBe(false);
  });

  it("joins only the address parts that are present", () => {
    const a = contactToApplicant({
      name: "P Q",
      home_address_street: "1 High St",
      home_address_state: "VIC",
    });
    expect(a.address).toBe("1 High St, VIC");
  });
});

describe("factFindFromContact", () => {
  it("prefills only the first applicant and leaves the rest of the form blank", () => {
    const data = factFindFromContact(fullContact);
    expect(data.applicants[0].family_name).toBe("Smith");
    // Second applicant and the wider form stay at the empty template.
    expect(data.applicants[1].family_name).toBe("");
    expect(data.applicants[1].given_names).toBe("");
    expect(data.loan.amount_required).toBeNull();
    expect(data.referred_by).toBe("");
  });
});
