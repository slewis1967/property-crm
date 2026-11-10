import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * Route-level guard for the calculations PERSISTENCE path — the save/load
 * endpoint behind the opportunity "Calculations" section, where a borrower's
 * assessed capacity inputs/outputs are written to Supabase.
 *
 * The repo already tests routes by importing the handler and driving it with a
 * `NextRequest` (see `smoke.test.ts`). Here we additionally mock the Supabase
 * client (`utils/supabase`) — which never throws at import time, it degrades to
 * a placeholder client — so we exercise the route's REAL validation and
 * serialization logic without a live database.
 *
 * Scope covered: input validation (calculator_type allow-list, required name,
 * required inputs object), the exact insert payload (name trimmed, outputs
 * defaulted to null), the loaded shape, and error propagation. A full DB
 * round-trip (RLS, generated columns, ordering) still needs an integration
 * harness — noted as a follow-up in the PR.
 */

const h = vi.hoisted(() => {
  const state: { result: { data: unknown; error: unknown }; captured: Record<string, unknown> } = {
    result: { data: null, error: null },
    captured: {},
  };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "single"]) {
    builder[m] = (...args: unknown[]) => {
      state.captured[m] = args;
      return builder;
    };
  }
  builder.insert = (payload: unknown) => {
    state.captured.insert = payload;
    return builder;
  };
  // Make the whole builder awaitable, resolving to the configured result.
  builder.then = (resolve: (v: unknown) => unknown) => resolve(state.result);
  const from = (table: string) => {
    state.captured.table = table;
    return builder;
  };
  return { state, supabase: { from } };
});

vi.mock("../../../../../utils/supabase", () => ({ supabase: h.supabase }));

// Imported after the mock is registered (vi.mock is hoisted above imports).
import { GET, POST } from "./route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/opportunities/opp-1/calculations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  calculator_type: "borrowing",
  name: "  Kim Ho — max borrow  ",
  inputs: { income: 120000, taxYear: "2026-27" },
  outputs: { maxLoan: 682243 },
};

beforeEach(() => {
  h.state.result = { data: null, error: null };
  h.state.captured = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET (load saved calculations)", () => {
  it("returns the rows for the opportunity from the calculations table", async () => {
    const rows = [{ id: "c1", calculator_type: "borrowing", name: "Scenario A" }];
    h.state.result = { data: rows, error: null };

    const res = await GET(new NextRequest("http://localhost/x"), params("opp-42"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ calculations: rows });
    expect(h.state.captured.table).toBe("opportunity_calculations");
    // Scoped to the opportunity id from the route params.
    expect(h.state.captured.eq).toEqual(["opportunity_id", "opp-42"]);
  });

  it("returns [] when Supabase yields no rows", async () => {
    h.state.result = { data: null, error: null };
    const res = await GET(new NextRequest("http://localhost/x"), params("opp-1"));
    expect(await res.json()).toEqual({ calculations: [] });
  });

  it("propagates a Supabase error as a 500", async () => {
    h.state.result = { data: null, error: { message: "boom" } };
    const res = await GET(new NextRequest("http://localhost/x"), params("opp-1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST (save a calculation)", () => {
  it("rejects an unknown calculator_type with 400 and does not write", async () => {
    const res = await POST(postReq({ ...validBody, calculator_type: "nonsense" }), params("opp-1"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("calculator_type must be one of");
    expect(h.state.captured.insert).toBeUndefined();
  });

  it("requires a non-empty name", async () => {
    const res = await POST(postReq({ ...validBody, name: "   " }), params("opp-1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
    expect(h.state.captured.insert).toBeUndefined();
  });

  it("requires an inputs object", async () => {
    const res = await POST(postReq({ ...validBody, inputs: null }), params("opp-1"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "inputs is required" });
  });

  it("persists a normalized row: name trimmed, outputs kept, opportunity_id from the path", async () => {
    h.state.result = {
      data: { id: "c9", calculator_type: "borrowing", name: "Kim Ho — max borrow" },
      error: null,
    };
    const res = await POST(postReq(validBody), params("opp-77"));
    expect(res.status).toBe(201);
    expect(((await res.json()) as { calculation: { id: string } }).calculation.id).toBe("c9");

    expect(h.state.captured.table).toBe("opportunity_calculations");
    expect(h.state.captured.insert).toEqual({
      opportunity_id: "opp-77",
      calculator_type: "borrowing",
      name: "Kim Ho — max borrow", // trimmed
      inputs: { income: 120000, taxYear: "2026-27" },
      outputs: { maxLoan: 682243 },
    });
  });

  it("defaults missing outputs to null (not undefined)", async () => {
    const { outputs: _drop, ...noOutputs } = validBody;
    void _drop;
    h.state.result = { data: { id: "c1" }, error: null };
    await POST(postReq(noOutputs), params("opp-1"));
    expect((h.state.captured.insert as { outputs: unknown }).outputs).toBeNull();
  });

  it("propagates a Supabase insert error as a 500", async () => {
    h.state.result = { data: null, error: { message: "insert failed" } };
    const res = await POST(postReq(validBody), params("opp-1"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "insert failed" });
  });
});
