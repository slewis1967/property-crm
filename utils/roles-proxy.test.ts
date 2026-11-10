import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

// Local mode (no Cloudflare): DEV_USER_EMAIL picks the role, so this drives
// the same roleGate the production path calls after JWT verification.
function req(path: string, method = "GET") {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers: method === "GET" ? {} : { origin: "http://localhost:3000" },
  });
}

describe("proxy role gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("redirects a marketing user off a PII page to /analytics", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("DEV_USER_EMAIL", "chris@regathered.com.au");
    const res = await proxy(req("/contacts"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/analytics");
  });

  it("403s a marketing user on a PII API", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("DEV_USER_EMAIL", "chris@regathered.com.au");
    expect((await proxy(req("/api/fact-finds"))).status).toBe(403);
    expect((await proxy(req("/api/properties/delete", "POST"))).status).toBe(403);
  });

  it("lets a marketing user through to an allowed page", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("DEV_USER_EMAIL", "chris@regathered.com.au");
    const res = await proxy(req("/properties/map"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves staff unrestricted", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("DEV_USER_EMAIL", "sean.l@nextkey.com.au");
    expect((await proxy(req("/contacts"))).status).toBe(200);
    expect((await proxy(req("/api/fact-finds"))).status).toBe(200);
  });
});
