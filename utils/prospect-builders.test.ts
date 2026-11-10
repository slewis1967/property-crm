import { describe, it, expect } from "vitest";
import {
  domainOf,
  stockDomainsFor,
  transitionFor,
  primaryContact,
  prospectTableMissing,
  type ProspectContact,
} from "./prospect-builders";

const contact = (over: Partial<ProspectContact>): ProspectContact => ({
  name: null, role: null, email: null, phone: null, phone_alt: null, notes: null, ...over,
});

describe("transitionFor", () => {
  it("walks prospect -> requested -> signed -> onboarded, one step at a time", () => {
    expect(transitionFor("request_agreement", "prospect")).toEqual({ to: "agreement_requested" });
    expect(transitionFor("mark_signed", "agreement_requested")).toEqual({ to: "agreement_signed" });
    expect(transitionFor("onboard", "agreement_signed")).toEqual({ to: "onboarded" });
  });

  it("refuses to skip the signed step", () => {
    expect(transitionFor("onboard", "prospect")).toBeNull();
    expect(transitionFor("onboard", "agreement_requested")).toBeNull();
    expect(transitionFor("mark_signed", "prospect")).toBeNull();
  });

  it("undoes one step and clears that step's stamp, but never un-onboards", () => {
    expect(transitionFor("undo", "agreement_signed")).toEqual({ to: "agreement_requested", clear: "agreement_signed" });
    expect(transitionFor("undo", "agreement_requested")).toEqual({ to: "prospect", clear: "agreement_requested" });
    expect(transitionFor("undo", "onboarded")).toBeNull();
    expect(transitionFor("undo", "prospect")).toBeNull();
  });
});

describe("domainOf", () => {
  it("reads emails and URLs, lowercases, strips www", () => {
    expect(domainOf("michaelstarr@landmarketingQLD.com.au")).toBe("landmarketingqld.com.au");
    expect(domainOf("https://www.propertywealthqueensland.com.au")).toBe("propertywealthqueensland.com.au");
    expect(domainOf("https://www.abngroup.com.au/wholesale/")).toBe("abngroup.com.au");
    expect(domainOf("http://www.landmarketingqld.com.au")).toBe("landmarketingqld.com.au");
  });

  it("returns null for junk", () => {
    expect(domainOf("")).toBeNull();
    expect(domainOf(null)).toBeNull();
    expect(domainOf("not a domain")).toBeNull();
  });
});

describe("stockDomainsFor", () => {
  it("prefers email domains over the website (sister entities share a site)", () => {
    expect(
      stockDomainsFor({ website: "https://thomaspaulconstructions.com", contacts: [contact({ email: "admin@tpcqld.com.au" })] }),
    ).toEqual(["tpcqld.com.au"]);
  });

  it("falls back to the website when no email is known", () => {
    expect(stockDomainsFor({ website: "https://www.rpmgrp.com.au", contacts: [contact({ name: "Clinton" })] })).toEqual([
      "rpmgrp.com.au",
    ]);
  });

  it("never emits a personal mailbox domain", () => {
    expect(stockDomainsFor({ website: null, contacts: [contact({ email: "someone@gmail.com" })] })).toEqual([]);
    expect(
      stockDomainsFor({ website: "https://firm.com.au", contacts: [contact({ email: "someone@gmail.com" })] }),
    ).toEqual(["firm.com.au"]);
  });

  it("dedupes", () => {
    expect(
      stockDomainsFor({
        website: null,
        contacts: [contact({ email: "a@x.com.au" }), contact({ email: "b@X.com.au" })],
      }),
    ).toEqual(["x.com.au"]);
  });
});

describe("primaryContact", () => {
  it("takes the first email and first phone, even from different contacts", () => {
    expect(
      primaryContact({ contacts: [contact({ phone: "07 1" }), contact({ email: "a@b.com", phone: "07 2" })] }),
    ).toEqual({ email: "a@b.com", phone: "07 1" });
  });
});

describe("prospectTableMissing", () => {
  it("matches missing-table codes only", () => {
    expect(prospectTableMissing({ code: "42P01" })).toBe(true);
    expect(prospectTableMissing({ code: "PGRST205" })).toBe(true);
    expect(prospectTableMissing({ code: "42703" })).toBe(false);
    expect(prospectTableMissing(null)).toBe(false);
  });
});
