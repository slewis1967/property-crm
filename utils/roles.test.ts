import { describe, expect, it } from "vitest";
import { marketingMayAccess, roleForEmail } from "./roles";

describe("roleForEmail", () => {
  it("maps the marketing address, case-insensitively", () => {
    expect(roleForEmail("chris@regathered.com.au")).toBe("marketing");
    expect(roleForEmail(" Chris@Regathered.com.au ")).toBe("marketing");
  });
  it("treats everyone else as staff", () => {
    expect(roleForEmail("sean.l@nextkey.com.au")).toBe("staff");
    expect(roleForEmail("glenn.m@nextkey.com.au")).toBe("staff");
    expect(roleForEmail(null)).toBe("staff");
  });
});

describe("marketingMayAccess", () => {
  it("allows the marketing pages", () => {
    for (const p of ["/analytics", "/social", "/social/", "/properties", "/properties/map", "/suburbs"]) {
      expect(marketingMayAccess(p, "GET")).toBe(true);
    }
  });
  it("blocks PII and commercial pages", () => {
    for (const p of [
      "/", "/contacts", "/contacts/abc", "/fact-find", "/opportunities", "/deals",
      "/inbox", "/broadcast", "/sequences", "/leads", "/aml", "/settings",
      "/properties/123", "/media", "/feedback", "/revenue", "/shared-folder",
    ]) {
      expect(marketingMayAccess(p, "GET")).toBe(false);
    }
  });
  it("allows only read methods on the stock APIs", () => {
    expect(marketingMayAccess("/api/properties/list", "GET")).toBe(true);
    expect(marketingMayAccess("/api/properties/map", "GET")).toBe(true);
    expect(marketingMayAccess("/api/properties/delete", "POST")).toBe(false);
    expect(marketingMayAccess("/api/properties/map/geocode", "POST")).toBe(false);
    expect(marketingMayAccess("/api/properties/list", "POST")).toBe(false);
  });
  it("blocks every other API, including PII ones", () => {
    for (const p of ["/api/contacts", "/api/fact-finds", "/api/deals", "/api/feedback", "/api/voice"]) {
      expect(marketingMayAccess(p, "GET")).toBe(false);
    }
  });
  it("allows the suburb brief POST", () => {
    expect(marketingMayAccess("/api/ai/suburb-brief", "POST")).toBe(true);
  });
  it("blocks server-action POSTs to pages", () => {
    expect(marketingMayAccess("/analytics", "POST")).toBe(false);
  });
  it("allows public static files but not API paths that look like files", () => {
    expect(marketingMayAccess("/logo.png", "GET")).toBe(true);
    expect(marketingMayAccess("/manifest.json", "GET")).toBe(true);
    expect(marketingMayAccess("/api/export.json", "GET")).toBe(false);
  });
});
