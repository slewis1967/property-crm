import { describe, it, expect } from "vitest";
import { emptyAmlCase, type BeneficialOwner } from "./aml";
import { amlPartyToContactRecord, beneficialOwnerToContactRecord } from "./amlToContact";

describe("amlPartyToContactRecord", () => {
  it("maps the acting individual + residential address", () => {
    const data = emptyAmlCase("individual");
    data.entity.fullLegalName = "David John Halliday";
    data.entity.dob = "1979-11-05";
    data.entity.residentialAddress = {
      line1: "12 Smith St",
      suburb: "Toowong",
      state: "QLD",
      postcode: "4066",
      country: "Australia",
    };
    expect(amlPartyToContactRecord(data)).toEqual({
      full_name: "David John Halliday",
      name: "David John Halliday",
      date_of_birth: "1979-11-05",
      home_address_street: "12 Smith St",
      home_address_suburb: "Toowong",
      home_address_state: "QLD",
      home_address_postcode: "4066",
    });
  });

  it("omits blank fields (never writes empty strings)", () => {
    const data = emptyAmlCase("individual");
    data.entity.fullLegalName = "Solo Party";
    const rec = amlPartyToContactRecord(data);
    expect(rec).toEqual({ full_name: "Solo Party", name: "Solo Party" });
    expect(Object.values(rec).every((v) => v !== "")).toBe(true);
  });

  it("maps the authorised individual for an entity party too", () => {
    const data = emptyAmlCase("company");
    data.entity.companyName = "Acme Pty Ltd";
    data.entity.fullLegalName = "Jane Director"; // authorised individual acting for the entity
    data.entity.dob = "1970-01-01";
    const rec = amlPartyToContactRecord(data);
    expect(rec.full_name).toBe("Jane Director");
    expect(rec.date_of_birth).toBe("1970-01-01");
  });
});

describe("beneficialOwnerToContactRecord", () => {
  const bo = (over: Partial<BeneficialOwner>): BeneficialOwner => ({
    fullLegalName: "",
    dob: "",
    ownershipPercent: null,
    role: "",
    verified: false,
    ...over,
  });

  it("maps name + DOB only", () => {
    expect(beneficialOwnerToContactRecord(bo({ fullLegalName: "Bo Owner", dob: "1965-03-03" }))).toEqual({
      full_name: "Bo Owner",
      name: "Bo Owner",
      date_of_birth: "1965-03-03",
    });
  });

  it("is empty for an unnamed owner (skipped downstream)", () => {
    expect(beneficialOwnerToContactRecord(bo({}))).toEqual({});
  });
});
