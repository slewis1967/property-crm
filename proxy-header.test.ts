import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * Middleware header behaviour tests
 *
 * Validates that the edge proxy strips any client-forged x-public-route and
 * sets its own trusted value based on the request path:
 *  - staff path => 0
 *  - public path => 1
 */
describe("proxy header sanitation: x-public-route", () => {
  let savedAuthMode: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeEach(() => {
    savedAuthMode = process.env.AUTH_MODE;
    savedNodeEnv = process.env.NODE_ENV;
    // Force tunnel mode so public/staff branches run even in tests.
    process.env.AUTH_MODE = "tunnel";
    process.env.NODE_ENV = "test";
  });
  afterEach(() => {
    if (savedAuthMode !== undefined) process.env.AUTH_MODE = savedAuthMode;
    else delete process.env.AUTH_MODE;
    if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv;
    else delete process.env.NODE_ENV;
  });

  it("overwrites a forged client x-public-route=1 on a STAFF path with 0", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("./proxy");
    const req = new NextRequest("http://localhost/properties", {
      headers: {
        // Client-forged value — must be stripped/ignored.
        "x-public-route": "1",
        // Presence is required for the CF Access gate when not public. Contents
        // need not be valid in tests — verification degrades to header-trust
        // when CF env is unset.
        "cf-access-authenticated-user-email": "alice@example.com",
        "cf-access-jwt-assertion": "fake.jwt.token",
      },
    });
    const res = await proxy(req as any);
    // Next encodes request-override headers onto the response for downstream handling.
    const overridden = res.headers.get("x-middleware-override-headers") || "";
    expect(overridden.split(",").map((s) => s.trim().toLowerCase())).toContain("x-public-route");
    expect(res.headers.get("x-middleware-request-x-public-route")).toBe("0");
    // Also carries the resolved user email for downstream APIs.
    expect(res.headers.get("x-user-email")).toBe("alice@example.com");
  });

  it("sets x-public-route=1 for a TRUSTED public path", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("./proxy");
    const req = new NextRequest("http://localhost/portal/abc123", {
      headers: {
        // A client may try to forge 0; the proxy must set 1 for public paths.
        "x-public-route": "0",
      },
    });
    const res = await proxy(req as any);
    const overridden = res.headers.get("x-middleware-override-headers") || "";
    expect(overridden.split(",").map((s) => s.trim().toLowerCase())).toContain("x-public-route");
    expect(res.headers.get("x-middleware-request-x-public-route")).toBe("1");
    // No user header on public paths.
    expect(res.headers.get("x-user-email")).toBeNull();
  });

  it("sets x-public-route=0 for a STAFF path", async () => {
    const { NextRequest } = await import("next/server");
    const { proxy } = await import("./proxy");
    const req = new NextRequest("http://localhost/contacts", {
      headers: {
        "cf-access-authenticated-user-email": "bob@example.com",
        "cf-access-jwt-assertion": "fake.jwt.token",
      },
    });
    const res = await proxy(req as any);
    const overridden = res.headers.get("x-middleware-override-headers") || "";
    expect(overridden.split(",").map((s) => s.trim().toLowerCase())).toContain("x-public-route");
    expect(res.headers.get("x-middleware-request-x-public-route")).toBe("0");
    expect(res.headers.get("x-user-email")).toBe("bob@example.com");
  });
});

