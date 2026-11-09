import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * book.springboardhomes.com.au is a Netlify domain alias with NO Cloudflare
 * Access in front of it. These tests drive the real proxy() and check that the
 * host exposes the booking page and nothing else, while crm.nextkey.com.au
 * behaves exactly as before.
 */

const BOOK = "https://book.springboardhomes.com.au";
const CRM = "https://crm.nextkey.com.au";
// Forged CF Access headers: presence alone must never open anything on the
// booking host (verification degrades to header-trust when CF env is unset,
// which is exactly the case these tests run in).
const FORGED_CF = {
  "cf-access-authenticated-user-email": "attacker@example.com",
  "cf-access-jwt-assertion": "fake.jwt.token",
};

async function run(url: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  const { proxy } = await import("./proxy");
  return proxy(new NextRequest(url, { method: init.method ?? "GET", headers: init.headers }));
}

function reqHeader(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe.each([
  ["tunnel", "tunnel"],
  // The allow-list must hold even where the CF gate is relaxed (local dev).
  ["local", "local"],
])("book.springboardhomes.com.au allow-list (AUTH_MODE=%s)", (_label, mode) => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", mode);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rewrites / to the Springboard booking page", async () => {
    const res = await run(`${BOOK}/`);
    expect(res.status).toBe(200);
    const target = res.headers.get("x-middleware-rewrite");
    expect(target).not.toBeNull();
    expect(new URL(target!).pathname).toBe("/book/springboard");
    expect(reqHeader(res, "x-public-route")).toBe("1");
    expect(reqHeader(res, "x-springboard-book-host")).toBe("1");
  });

  it.each([
    ["GET", "/book/springboard"],
    ["GET", "/api/book/springboard"],
    ["POST", "/api/book/springboard"],
    ["GET", "/api/book/springboard/og"],
    ["GET", "/api/book/springboard/icon"],
    ["GET", "/api/portal/logo"],
    ["GET", "/_next/static/chunks/main.js"],
    // The lead's guest video join
    ["GET", "/join/abc.def.ghi"],
    ["GET", "/join/abc.def.ghi/pa"],
    ["POST", "/join/abc.def.ghi/pa"],
    ["GET", "/join/abc.def.ghi/pa/file"],
    ["POST", "/api/livekit/guest-token"],
  ])("lets %s %s through, tagged public + booking host", async (method, path) => {
    const res = await run(`${BOOK}${path}`, { method, headers: { origin: BOOK } });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(reqHeader(res, "x-public-route")).toBe("1");
    expect(reqHeader(res, "x-springboard-book-host")).toBe("1");
    expect(res.headers.get("x-user-email")).toBeNull();
  });

  it.each(["/favicon.ico", "/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"])(
    "serves the Springboard icon for %s",
    async (path) => {
      const res = await run(`${BOOK}${path}`);
      expect(new URL(res.headers.get("x-middleware-rewrite")!).pathname).toBe("/api/book/springboard/icon");
    },
  );

  it("answers robots.txt itself: the booking page only", async () => {
    const res = await run(`${BOOK}/robots.txt`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Allow: /$");
    expect(body).toContain("Allow: /book/springboard$");
    expect(body).toContain("Disallow: /");
    expect(body).not.toMatch(/nextkey/i);
  });

  it.each([
    // CRM pages and APIs
    "/contacts",
    "/contacts/123",
    "/api/leads",
    "/api/contacts/list",
    "/login",
    "/aggregator",
    "/aggregator/runs",
    "/properties",
    "/settings",
    "/m",
    "/video/room-1",
    "/shared-folder",
    "/api/shared-folder",
    "/api/voice/converse",
    // Other hosts' booking pages, and the bare /book index
    "/book",
    "/book/sean",
    "/book/glenn",
    "/api/book/sean",
    "/api/book/glenn/og",
    "/book/springboard/extra",
    "/api/book/springboard/anything",
    // The CRM's other public (token / session) surfaces stay on the CRM host
    "/api/livekit/webhook",
    "/api/livekit/token",
    "/api/livekit/record",
    "/api/livekit/calls",
    "/api/livekit/guest-link",
    "/api/livekit/guest-tokens",
    // Only the exact join shapes
    "/join",
    "/join/",
    "/joined/tok",
    "/join/tok/other",
    "/join/tok/pa/file/x",
    "/join/a/b/pa",
    "/sign/tok",
    "/api/sign/tok/complete",
    "/portal/tok",
    "/api/portal/tok",
    "/api/portal/mygov-guide",
    "/introducer",
    "/api/introducer/login",
    "/partner",
    "/shortlist/tok",
    "/api/cron/run",
    // Static files the booking page does not load
    "/manifest.json",
    "/logo.png",
    "/og-image.png",
    "/favicon-32x32.png",
    "/help/activity-feed-check-elvis.mp4",
    "/sitemap.xml",
    // Normalisation tricks
    "//contacts",
    "/BOOK/springboard",
    "/book/springboard/",
  ])("404s %s (no redirect to the CRM)", async (path) => {
    const res = await run(`${BOOK}${path}`, { headers: FORGED_CF });
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-user-email")).toBeNull();
    expect(await res.text()).not.toMatch(/nextkey|cloudflare/i);
  });

  it.each([
    ["POST", "/book/springboard"],
    ["POST", "/"],
    ["PUT", "/api/book/springboard"],
    ["DELETE", "/api/book/springboard"],
    ["PATCH", "/api/book/springboard"],
    ["POST", "/api/book/springboard/og"],
    ["POST", "/api/portal/logo"],
    ["POST", "/robots.txt"],
    ["GET", "/api/livekit/guest-token"],
    ["POST", "/join/tok"],
    ["POST", "/join/tok/pa/file"],
    ["DELETE", "/join/tok/pa"],
  ])("404s %s %s (method not on the allow-list)", async (method, path) => {
    const res = await run(`${BOOK}${path}`, { method, headers: { origin: BOOK } });
    expect(res.status).toBe(404);
  });

  it.each([CRM, "https://evil.example", "null"])("403s a booking POST from origin %s", async (origin) => {
    const res = await run(`${BOOK}/api/book/springboard`, { method: "POST", headers: { origin } });
    expect(res.status).toBe(403);
  });

  it("403s a guest-token POST from the CRM origin", async () => {
    const res = await run(`${BOOK}/api/livekit/guest-token`, { method: "POST", headers: { origin: CRM } });
    expect(res.status).toBe(403);
  });

  it("allows a booking POST with no Origin header", async () => {
    const res = await run(`${BOOK}/api/book/springboard`, { method: "POST" });
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("restricts a request whose forwarded host names the booking host", async () => {
    const res = await run(`${CRM}/contacts`, { headers: { ...FORGED_CF, "x-forwarded-host": "book.springboardhomes.com.au" } });
    expect(res.status).toBe(404);
  });

  it("matches the host case-insensitively and with a port", async () => {
    expect((await run("https://BOOK.SpringboardHomes.com.au/contacts")).status).toBe(404);
    expect((await run("https://book.springboardhomes.com.au:443/contacts")).status).toBe(404);
  });
});

describe("crm.nextkey.com.au is unchanged", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_MODE", "tunnel");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["/contacts", "/api/leads", "/aggregator", "/login"])(
    "still gates %s behind CF Access (401 without it)",
    async (path) => {
      const res = await run(`${CRM}${path}`);
      expect(res.status).toBe(401);
    },
  );

  it.each(["/contacts", "/api/leads", "/aggregator"])("still serves %s to a CF Access user", async (path) => {
    const res = await run(`${CRM}${path}`, { headers: FORGED_CF });
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(reqHeader(res, "x-public-route")).toBe("0");
    expect(res.headers.get("x-user-email")).toBe("attacker@example.com");
  });

  it.each(["/book/springboard", "/book/sean", "/api/book/glenn", "/join/abc", "/join/abc/pa", "/portal/tok"])(
    "still treats %s as public",
    async (path) => {
      const res = await run(`${CRM}${path}`);
      expect(reqHeader(res, "x-public-route")).toBe("1");
    },
  );

  it.each(["/api/livekit/token", "/api/livekit/record", "/api/livekit/guest-link"])(
    "still gates %s behind CF Access",
    async (path) => {
      expect((await run(`${CRM}${path}`, { method: "POST" })).status).toBe(401);
    },
  );

  it("does not rewrite / (the War Room still needs CF Access)", async () => {
    const res = await run(`${CRM}/`);
    expect(res.status).toBe(401);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("strips a forged booking-host flag from the request", async () => {
    const res = await run(`${CRM}/book/springboard`, { headers: { "x-springboard-book-host": "1" } });
    expect(reqHeader(res, "x-springboard-book-host")).toBeNull();
    expect(reqHeader(res, "x-public-route")).toBe("1");
  });

  it("passes /favicon.ico straight through, as when the matcher excluded it", async () => {
    const res = await run(`${CRM}/favicon.ico`);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-middleware-override-headers")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("keeps robots.txt behind the gate, as before", async () => {
    expect((await run(`${CRM}/robots.txt`)).status).toBe(401);
  });

  it("still rejects a mutation from the booking host's origin (CRM trust list not widened)", async () => {
    const res = await run(`${CRM}/api/book/springboard`, { method: "POST", headers: { origin: BOOK } });
    expect(res.status).toBe(403);
  });
});
