import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * Route-level guard for the calculation UPDATE/DELETE persistence path. Mirrors
 * `opportunities/[id]/calculations/route.test.ts`: mocks the Supabase client
 * and `requireAuth` so the route's real field-normalization runs without a DB.
 *
 * Focus: the PATCH update-object builder (name trimmed, inputs/outputs only
 * when present, `updated_at` stamped, "no valid fields" → 400) and the auth
 * gate on both handlers. Full DB round-trip is a follow-up (needs a harness).
 */

const h = vi.hoisted(() => {
  const state: {
    result: { data: unknown; error: unknown };
    captured: Record<string, unknown>;
    auth: unknown;
  } = { result: { data: null, error: null }, captured: {}, auth: "advisor@nextkey.com.au" };
  const builder: Record<string, unknown> = {};
  builder.update = (payload: unknown) => {
    state.captured.update = payload;
    return builder;
  };
  builder.delete = () => {
    state.captured.deleted = true;
    return builder;
  };
  for (const m of ["select", "eq", "single"]) {
    builder[m] = (...args: unknown[]) => {
      state.captured[m] = args;
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve(state.result);
  const from = (table: string) => {
    state.captured.table = table;
    return builder;
  };
  return { state, supabase: { from } };
});

vi.mock("../../../../utils/supabase", () => ({ supabase: h.supabase }));
vi.mock("../../../../utils/cf-access", () => ({
  requireAuth: vi.fn(async () => h.state.auth),
}));

import { PATCH, DELETE } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function patchReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/calculations/c1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.state.result = { data: { id: "c1" }, error: null };
  h.state.captured = {};
  h.state.auth = "advisor@nextkey.com.au";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH (update a saved calculation)", () => {
  it("401s when unauthenticated (requireAuth returns a NextResponse)", async () => {
    h.state.auth = NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    const res = await PATCH(patchReq({ name: "x" }), params("c1"));
    expect(res.status).toBe(401);
    expect(h.state.captured.update).toBeUndefined();
  });

  it("builds an update with a trimmed name and a fresh updated_at", async () => {
    const before = Date.now();
    const res = await PATCH(patchReq({ name: "  Revised scenario  " }), params("c1"));
    expect(res.status).toBe(200);
    const update = h.state.captured.update as { name: string; updated_at: string };
    expect(update.name).toBe("Revised scenario");
    expect(Date.parse(update.updated_at)).toBeGreaterThanOrEqual(before);
    // eq scopes the update to the id from the path.
    expect(h.state.captured.eq).toEqual(["id", "c1"]);
  });

  it("updates inputs and outputs when supplied", async () => {
    await PATCH(patchReq({ inputs: { income: 90000 }, outputs: { maxLoan: 400000 } }), params("c1"));
    const update = h.state.captured.update as Record<string, unknown>;
    expect(update.inputs).toEqual({ income: 90000 });
    expect(update.outputs).toEqual({ maxLoan: 400000 });
  });

  it("allows explicitly clearing outputs to null", async () => {
    await PATCH(patchReq({ outputs: null }), params("c1"));
    const update = h.state.captured.update as Record<string, unknown>;
    expect(update.outputs).toBeNull();
  });

  it("ignores a blank name and rejects an otherwise-empty patch with 400", async () => {
    const res = await PATCH(patchReq({ name: "   " }), params("c1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "no valid fields" });
    expect(h.state.captured.update).toBeUndefined();
  });

  it("propagates a Supabase update error as a 500", async () => {
    h.state.result = { data: null, error: { message: "update failed" } };
    const res = await PATCH(patchReq({ name: "ok" }), params("c1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "update failed" });
  });
});

describe("DELETE (remove a saved calculation)", () => {
  it("401s when unauthenticated and does not delete", async () => {
    h.state.auth = NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    const res = await DELETE(patchReq({}), params("c1"));
    expect(res.status).toBe(401);
    expect(h.state.captured.deleted).toBeUndefined();
  });

  it("deletes the row scoped to the id and returns ok", async () => {
    h.state.result = { data: null, error: null };
    const res = await DELETE(patchReq({}), params("c9"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.state.captured.table).toBe("opportunity_calculations");
    expect(h.state.captured.deleted).toBe(true);
    expect(h.state.captured.eq).toEqual(["id", "c9"]);
  });

  it("propagates a Supabase delete error as a 500", async () => {
    h.state.result = { data: null, error: { message: "delete failed" } };
    const res = await DELETE(patchReq({}), params("c1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "delete failed" });
  });
});
