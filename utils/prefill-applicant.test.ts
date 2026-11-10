import { describe, it, expect } from "vitest";
import { applicantName, applicantEmail } from "./prefill-applicant";

// The two fixtures below are the real stored shapes, trimmed: a Needs Analysis
// nests the address under `contact`, a Fact Find keeps it top level. Reading
// only the top level silently dropped applicant 2's email from the "Request
// documents" popover on every joint NA, so both shapes are pinned here.
const naApplicant = {
  given_names: "Mark Benjamin",
  surname: "Libman",
  contact: {
    email: "mark.libman@live.com",
    home_phone: "",
    mobile_phone: "0401003052",
    preferred_contact: "email",
  },
};

const ffApplicant = {
  given_names: "Mark Benjamin",
  family_name: "Libman",
  email: "mark.libman@live.com",
};

describe("applicantEmail", () => {
  it("reads the nested contact.email a Needs Analysis stores", () => {
    expect(applicantEmail(naApplicant)).toBe("mark.libman@live.com");
  });

  it("reads the top-level email a Fact Find stores", () => {
    expect(applicantEmail(ffApplicant)).toBe("mark.libman@live.com");
  });

  it("prefers a top-level email over a nested one", () => {
    expect(applicantEmail({ email: "top@x.com", contact: { email: "nested@x.com" } })).toBe("top@x.com");
  });

  it("falls back to the nested email when the top-level one is blank", () => {
    expect(applicantEmail({ email: "   ", contact: { email: "nested@x.com" } })).toBe("nested@x.com");
  });

  it("returns empty for a missing, empty or malformed applicant", () => {
    expect(applicantEmail(undefined)).toBe("");
    expect(applicantEmail({})).toBe("");
    expect(applicantEmail({ contact: null as unknown as Record<string, unknown> })).toBe("");
    expect(applicantEmail({ contact: "nope" as unknown as Record<string, unknown> })).toBe("");
    expect(applicantEmail({ contact: {} })).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(applicantEmail({ contact: { email: "  a@b.com  " } })).toBe("a@b.com");
  });
});

describe("applicantName", () => {
  it("joins the Needs Analysis parts (given_names + surname)", () => {
    expect(applicantName(naApplicant)).toBe("Mark Benjamin Libman");
  });

  it("joins the Fact Find parts (given_names + family_name)", () => {
    expect(applicantName(ffApplicant)).toBe("Mark Benjamin Libman");
  });

  it("copes with only one part present, and with none", () => {
    expect(applicantName({ given_names: "Marcia" })).toBe("Marcia");
    expect(applicantName({ surname: "Libman" })).toBe("Libman");
    expect(applicantName({})).toBe("");
    expect(applicantName(undefined)).toBe("");
  });
});
