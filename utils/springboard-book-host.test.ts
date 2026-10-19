import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crmLinkOrigin,
  isSpringboardBookHost,
  springboardBookRoute,
} from "./springboard-book-host";
import { findHostBySlug } from "./scheduling-hosts";

describe("isSpringboardBookHost", () => {
  it("matches the booking host in any of the signals given", () => {
    expect(isSpringboardBookHost("book.springboardhomes.com.au")).toBe(true);
    expect(isSpringboardBookHost("crm.nextkey.com.au", null, "book.springboardhomes.com.au")).toBe(true);
    expect(isSpringboardBookHost("Book.SpringboardHomes.com.au:443")).toBe(true);
    expect(isSpringboardBookHost("book.springboardhomes.com.au.")).toBe(true);
  });

  it("does not match the CRM, the brand site or lookalikes", () => {
    expect(isSpringboardBookHost("crm.nextkey.com.au", "crmnex.netlify.app")).toBe(false);
    expect(isSpringboardBookHost("springboardhomes.com.au")).toBe(false);
    expect(isSpringboardBookHost("book.springboardhomes.com.au.evil.example")).toBe(false);
    expect(isSpringboardBookHost("evilbook.springboardhomes.com.au")).toBe(false);
    expect(isSpringboardBookHost(undefined, null, "")).toBe(false);
  });
});

describe("springboardBookRoute", () => {
  it("only allows exact paths, never a prefix of one", () => {
    expect(springboardBookRoute("/book/springboard", "GET").kind).toBe("pass");
    expect(springboardBookRoute("/book/springboardx", "GET").kind).toBe("not_found");
    expect(springboardBookRoute("/api/book/springboard/og/x", "GET").kind).toBe("not_found");
    expect(springboardBookRoute("/api/portal/logo/x", "GET").kind).toBe("not_found");
    expect(springboardBookRoute("/_next/image", "GET").kind).toBe("not_found");
  });

  it("serves the slug the hostname is for", () => {
    expect(findHostBySlug("springboard")?.brand).toBe("springboard");
  });
});

describe("crmLinkOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps the request origin on the CRM host", () => {
    expect(crmLinkOrigin("https://crm.nextkey.com.au", false)).toBe("https://crm.nextkey.com.au");
    expect(crmLinkOrigin("http://localhost:3000", false)).toBe("http://localhost:3000");
  });

  it("points /join and /video links at the CRM from the booking host", () => {
    vi.stubEnv("PUBLIC_APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(crmLinkOrigin("https://book.springboardhomes.com.au", true)).toBe("https://crm.nextkey.com.au");
    vi.stubEnv("PUBLIC_APP_URL", "https://crm.example.test/");
    expect(crmLinkOrigin("https://book.springboardhomes.com.au", true)).toBe("https://crm.example.test");
  });
});
