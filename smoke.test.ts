/**
 * Production smoke tests for the NextKey Property CRM.
 *
 * These run against the BUILT output (not a running server), verifying
 * that key modules compile, env validation works, and core utilities
 * behave correctly. They do NOT require Supabase or external services.
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from "vitest";

// ── Env validation ──────────────────────────────────────────────────────────

describe("validate-env", () => {
  it("throws when required vars are missing", async () => {
    // Clear all CRM env vars to trigger the error
    const keys = [
      "ANTHROPIC_API_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_KEY",
      "NEXUS_INTERNAL_API_KEY",
    ];
    const saved: Record<string, string | undefined> = {};
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }

    const { validateEnv } = await import("./utils/validate-env");
    expect(() => validateEnv()).toThrow("MISSING REQUIRED");

    // Restore
    for (const k of keys) {
      if (saved[k]) process.env[k] = saved[k];
      else delete process.env[k];
    }
  });

  it("warns on missing optional vars but does not throw", async () => {
    // Should warn about optional vars when critical ones are present
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_publishable_test";
    process.env.SUPABASE_SERVICE_KEY = "sb_secret_test";
    process.env.NEXUS_INTERNAL_API_KEY = "test-nexus-key";

    const { validateEnv } = await import("./utils/validate-env");
    // Should not throw — all required vars are set
    expect(() => validateEnv()).not.toThrow();
  });
});

// ── Observability wrapper ───────────────────────────────────────────────────

describe("withObservability", () => {
  it("sets x-response-time header on success", async () => {
    const { withObservability } = await import("./utils/observability");
    const wrapped = withObservability("TEST", async () => {
      const { NextResponse } = await import("next/server");
      return NextResponse.json({ ok: true });
    });

    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/test");
    const res = await wrapped(req);
    expect(res.headers.get("x-response-time")).toMatch(/^\d+ms$/);
    expect(res.status).toBe(200);
  });

  it("returns 500 and logs on uncaught errors", async () => {
    const { withObservability } = await import("./utils/observability");
    const wrapped = withObservability("TEST_FAIL", async () => {
      throw new Error("boom");
    });

    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/test");
    const res = await wrapped(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Internal server error");
  });
});

// ── API route shape checks ──────────────────────────────────────────────────

describe("API route exports", () => {
  // Routes transitively import `jose` for CF Access JWT verification,
  // which is slow to cold-load (~3s). Bump the per-test timeout to keep
  // the suite green without masking genuine hangs in the actual route
  // code.
  it("compare route exports POST handler", async () => {
    const mod = await import("./app/api/properties/compare/route");
    expect(mod.POST).toBeDefined();
    expect(typeof mod.POST).toBe("function");
  }, 30_000);

  it("sms/send route exports POST handler", async () => {
    const mod = await import("./app/api/sms/send/route");
    expect(mod.POST).toBeDefined();
    expect(typeof mod.POST).toBe("function");
  }, 30_000);
});