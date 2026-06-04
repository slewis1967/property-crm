import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isUnauthenticated,
  UNAUTHENTICATED_SENTINEL,
  currentUserEmail,
  userEmailFromRequest,
  requireAuth,
} from "./cf-access";

/**
 * These tests lock in the auth contract that the rest of the CRM relies
 * on. The two design properties we care about:
 *
 *  1. Production with no Cloudflare Access header → UNAUTHENTICATED_SENTINEL
 *     (not a real identity, not null, not a fallback to Sean's email).
 *     Routes that use the sentinel pattern rely on this to leak zero rows.
 *
 *  2. requireAuth() returns a NextResponse when unauth, the email otherwise.
 *     API routes that do outbound/spend-credits use requireAuth() so the
 *     sentinel doesn't get through.
 *
 * Dev mode (NODE_ENV != "production") gets a fallback so the app runs
 * locally without Cloudflare. We test that the sentinel pattern works
 * in prod mode by stubbing the module's internal NODE_ENV check via
 * setting process.env.NODE_ENV at import boundary (vi.stubEnv).
 */
describe("isUnauthenticated", () => {
  it("flags the sentinel", () => {
    expect(isUnauthenticated(UNAUTHENTICATED_SENTINEL)).toBe(true);
  });

  it("rejects real emails", () => {
    expect(isUnauthenticated("sean.l@nextkey.com.au")).toBe(false);
    expect(isUnauthenticated("dev@local")).toBe(false);
  });
});

describe("userEmailFromRequest (production sentinel behaviour)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
    vi.stubEnv("CF_ACCESS_AUD", "");
  });

  it("returns sentinel when no Cloudflare Access header is present", async () => {
    const req = new Request("https://crm.nextkey.com.au/api/test", {
      method: "POST",
    });
    const email = await userEmailFromRequest(req);
    expect(email).toBe(UNAUTHENTICATED_SENTINEL);
  });

  it("returns the CF Access email when header is present", async () => {
    const req = new Request("https://crm.nextkey.com.au/api/test", {
      method: "POST",
      headers: {
        "cf-access-authenticated-user-email": "sean.l@nextkey.com.au",
      },
    });
    const email = await userEmailFromRequest(req);
    expect(email).toBe("sean.l@nextkey.com.au");
  });

  it("ignores x-user-email in production (dev-only override)", async () => {
    const req = new Request("https://crm.nextkey.com.au/api/test", {
      method: "POST",
      headers: {
        "x-user-email": "attacker@example.com",
      },
    });
    const email = await userEmailFromRequest(req);
    // The CF Access header is missing, so we get the sentinel —
    // x-user-email is NOT honoured in production even though it would
    // be in dev mode. This is a security property worth testing.
    expect(email).toBe(UNAUTHENTICATED_SENTINEL);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe("requireAuth", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CF_ACCESS_TEAM_DOMAIN", "");
    vi.stubEnv("CF_ACCESS_AUD", "");
  });

  it("returns a 401 NextResponse for an unauthenticated request in production", async () => {
    const req = new Request("https://crm.nextkey.com.au/api/broadcast", {
      method: "POST",
    });
    const result = await requireAuth(req);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Response);
    const res = result as Response;
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthenticated" });
  });

  it("returns the email string for an authenticated request", async () => {
    const req = new Request("https://crm.nextkey.com.au/api/broadcast", {
      method: "POST",
      headers: {
        "cf-access-authenticated-user-email": "sean.l@nextkey.com.au",
      },
    });
    const result = await requireAuth(req);
    expect(typeof result).toBe("string");
    expect(result).toBe("sean.l@nextkey.com.au");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
});

describe("currentUserEmail (server component context)", () => {
  it("is exported as an async function for server components", () => {
    expect(typeof currentUserEmail).toBe("function");
    // Actually calling it from a test would require mocking next/headers,
    // which is more setup than this starter is aiming for. The two
    // request-based tests above cover the underlying logic.
  });
});
