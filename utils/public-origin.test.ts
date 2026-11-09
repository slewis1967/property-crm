import { describe, it, expect } from "vitest";
import { trustedOriginForHost } from "./public-origin";

describe("trustedOriginForHost", () => {
  it("keeps a host we serve from, always over https", () => {
    expect(trustedOriginForHost("crm.nextkey.com.au", "http", true)).toBe("https://crm.nextkey.com.au");
    expect(trustedOriginForHost("CRMNEX.netlify.app", "https", true)).toBe("https://crmnex.netlify.app");
  });
  it("replaces a forged host with the canonical one", () => {
    for (const host of ["evil.example", "crm.nextkey.com.au.evil.example", "crm.nextkey.com.au:8443", "", null]) {
      expect(trustedOriginForHost(host, "https", true)).toBe("https://crm.nextkey.com.au");
    }
  });
  it("allows localhost only outside production", () => {
    expect(trustedOriginForHost("localhost:3000", "http", false)).toBe("http://localhost:3000");
    expect(trustedOriginForHost("localhost:3000", "http", true)).toBe("https://crm.nextkey.com.au");
    expect(trustedOriginForHost("localhost.evil.example", "http", false)).toBe("https://crm.nextkey.com.au");
  });
});
