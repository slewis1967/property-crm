import { describe, expect, it } from "vitest";
import { authenticatedSenderDomains, nameFromAddress, personalSender } from "./personal-sender";

describe("personalSender", () => {
  const domains = ["nextkey.com.au"];

  it("sends as the logged-in NextKey user, named from their signature", () => {
    expect(personalSender("Glenn.M@nextkey.com.au", "Glenn Mayes", domains)).toEqual({
      fromEmail: "glenn.m@nextkey.com.au",
      fromName: "Glenn Mayes",
    });
  });

  it("falls back to a name built from the address when no signature name is saved", () => {
    expect(personalSender("sean.l@nextkey.com.au", null, domains)?.fromName).toBe("Sean L");
  });

  it("refuses a domain Brevo hasn't authenticated", () => {
    expect(personalSender("someone@gmail.com", "Someone", domains)).toBeNull();
  });

  it("refuses no user or a malformed one", () => {
    expect(personalSender(null, "x", domains)).toBeNull();
    expect(personalSender("not-an-email", "x", domains)).toBeNull();
  });
});

describe("authenticatedSenderDomains", () => {
  it("defaults to nextkey.com.au and reads a list from env", () => {
    expect(authenticatedSenderDomains({})).toEqual(["nextkey.com.au"]);
    expect(authenticatedSenderDomains({ BREVO_AUTHENTICATED_DOMAINS: "nextkey.com.au, Example.com" })).toEqual([
      "nextkey.com.au",
      "example.com",
    ]);
  });
});

describe("nameFromAddress", () => {
  it("title-cases the local part", () => {
    expect(nameFromAddress("glenn.m@nextkey.com.au")).toBe("Glenn M");
  });
});
