import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * CHARACTERIZATION tests for the NCCP Needs Analysis compliance-document routes
 * (list + POST create in ./route, GET one / PATCH / DELETE in ./[id]/route, and
 * the audit trail in ./[id]/history/route).
 *
 * Pins CURRENT behavior before the shared-helper dedup and must keep passing
 * UNCHANGED afterwards. Behaviors pinned: PII-safe LIST_COLUMNS (never `*`), the
 * NARROW table-missing check (a column error is NOT "table missing"), the exact
 * table name `nccp_needs_analyses`, the locked-status (Complete) edit/delete
 * refusals, and the audit-hook invocation on create/update/delete.
 */

type Result = { data: unknown; error: unknown };
type QueryCtx = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  cols: string | null;
  filters: [string, unknown][];
  payload: unknown;
  terminal: "maybeSingle" | "single" | "await" | null;
};

const h = vi.hoisted(() => {
  const state: {
    calls: QueryCtx[];
    auth: unknown;
    selectResult: Result;
    contactResult: Result;
    insertResult: Result;
    updateResult: Result;
    deleteResult: Result;
    auditInsertResult: Result;
    historyResult: Result;
  } = {
    calls: [],
    auth: "advisor@nextkey.com.au",
    selectResult: { data: null, error: null },
    contactResult: { data: null, error: null },
    insertResult: { data: { id: "new-id" }, error: null },
    updateResult: { data: null, error: null },
    deleteResult: { data: null, error: null },
    auditInsertResult: { data: null, error: null },
    historyResult: { data: [], error: null },
  };

  function resultFor(ctx: QueryCtx): Result {
    if (ctx.table === "compliance_document_audit") {
      return ctx.op === "insert" ? state.auditInsertResult : state.historyResult;
    }
    if (ctx.table === "contacts") return state.contactResult;
    switch (ctx.op) {
      case "insert":
        return state.insertResult;
      case "update":
        return state.updateResult;
      case "delete":
        return state.deleteResult;
      default:
        return state.selectResult;
    }
  }

  function makeBuilder(table: string) {
    const ctx: QueryCtx = { table, op: "select", cols: null, filters: [], payload: undefined, terminal: null };
    const b: Record<string, unknown> = {};
    b.select = (cols?: unknown) => {
      if (typeof cols === "string") ctx.cols = cols;
      return b;
    };
    b.insert = (payload: unknown) => {
      ctx.op = "insert";
      ctx.payload = payload;
      return b;
    };
    b.update = (payload: unknown) => {
      ctx.op = "update";
      ctx.payload = payload;
      return b;
    };
    b.delete = () => {
      ctx.op = "delete";
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      ctx.filters.push([col, val]);
      return b;
    };
    b.order = () => b;
    b.limit = () => b;
    const settle = (term: QueryCtx["terminal"]): Promise<Result> => {
      ctx.terminal = term;
      state.calls.push(ctx);
      return Promise.resolve(resultFor(ctx));
    };
    b.maybeSingle = () => settle("maybeSingle");
    b.single = () => settle("single");
    b.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
      settle("await").then(resolve, reject);
    return b;
  }

  return { state, supabase: { from: (t: string) => makeBuilder(t) } };
});

vi.mock("../../../utils/supabase", () => ({ supabase: h.supabase }));
vi.mock("../../../utils/cf-access", () => ({ requireAuth: vi.fn(async () => h.state.auth) }));

import { GET as listGet, POST } from "./route";
import { GET as oneGet, PATCH, DELETE } from "./[id]/route";
import { GET as historyGet } from "./[id]/history/route";
import { LOCKED_EDIT_MESSAGE, LOCKED_DELETE_MESSAGE } from "../../../utils/compliance-audit";

const DOC_TABLE = "nccp_needs_analyses";
const AUDIT_TABLE = "compliance_document_audit";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonReq(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/needs-analyses/x", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const auditCalls = () => h.state.calls.filter((c) => c.table === AUDIT_TABLE && c.op === "insert");
const docCall = (op: QueryCtx["op"]) => h.state.calls.find((c) => c.table === DOC_TABLE && c.op === op);

beforeEach(() => {
  h.state.calls = [];
  h.state.auth = "advisor@nextkey.com.au";
  h.state.selectResult = { data: null, error: null };
  h.state.contactResult = { data: null, error: null };
  h.state.insertResult = { data: { id: "na-1" }, error: null };
  h.state.updateResult = { data: null, error: null };
  h.state.deleteResult = { data: null, error: null };
  h.state.auditInsertResult = { data: null, error: null };
  h.state.historyResult = { data: [], error: null };
});

afterEach(() => vi.clearAllMocks());

describe("GET (list needs analyses)", () => {
  it("selects the explicit PII-safe LIST_COLUMNS — never `*` — from nccp_needs_analyses", async () => {
    h.state.selectResult = { data: [{ id: "na-1", applicant_name: "Smith, John" }], error: null };
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, needsAnalyses: [{ id: "na-1", applicant_name: "Smith, John" }] });
    const call = docCall("select");
    expect(call?.table).toBe(DOC_TABLE);
    expect(call?.cols).toBe("id,applicant_name,status,contact_id,loan_amount,created_by,created_at,updated_at");
    expect(call?.cols).not.toContain("*");
    expect(call?.cols).not.toContain("data");
  });

  it("401s when unauthenticated and never queries", async () => {
    h.state.auth = NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(401);
    expect(h.state.calls).toHaveLength(0);
  });

  it("degrades to an empty list when the TABLE is missing (PGRST205)", async () => {
    h.state.selectResult = { data: null, error: { code: "PGRST205", message: "Could not find the table" } };
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, needsAnalyses: [] });
  });

  it("does NOT treat a column-level error (PGRST204) as a missing table — surfaces a 500", async () => {
    h.state.selectResult = { data: null, error: { code: "PGRST204", message: "Could not find the 'x' column" } };
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });
});

describe("POST (create a needs analysis)", () => {
  it("inserts denormalized columns from the data blob, defaults status Draft, and records a create audit", async () => {
    const data = {
      applicants: [
        { surname: "Smith", given_names: "John" },
        { surname: "", given_names: "" },
      ],
      loan_amount_sought: 400000,
    };
    const res = await POST(jsonReq("POST", { data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "na-1" });

    const ins = docCall("insert");
    const row = ins?.payload as Record<string, unknown>;
    expect(ins?.table).toBe(DOC_TABLE);
    expect(row.status).toBe("Draft");
    expect(row.applicant_name).toBe("Smith, John");
    expect(row.loan_amount).toBe(400000);
    expect(row.created_by).toBe("advisor@nextkey.com.au");

    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    const a = audit[0].payload as Record<string, unknown>;
    expect(a.doc_type).toBe("needs_analysis");
    expect(a.action).toBe("create");
    expect(a.doc_id).toBe("na-1");
  });

  it("returns the MIGRATION_HINT with 501 when the table is missing on insert", async () => {
    h.state.insertResult = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    const res = await POST(jsonReq("POST", { data: {} }));
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: string }).error).toContain("Needs Analysis storage isn't set up");
  });
});

describe("GET (one needs analysis)", () => {
  it("returns the hydrated document from nccp_needs_analyses", async () => {
    h.state.selectResult = { data: { id: "na-9", status: "Draft", data: {} }, error: null };
    const res = await oneGet(jsonReq("GET"), params("na-9"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; needsAnalysis: { id: string; data: unknown } };
    expect(body.ok).toBe(true);
    expect(body.needsAnalysis.id).toBe("na-9");
    expect(body.needsAnalysis.data).toHaveProperty("applicants");
    expect(docCall("select")?.table).toBe(DOC_TABLE);
  });

  it("404s when the row does not exist", async () => {
    h.state.selectResult = { data: null, error: null };
    const res = await oneGet(jsonReq("GET"), params("missing"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH (save a needs analysis)", () => {
  it("updates a draft, re-derives denormalized columns, and records an update audit", async () => {
    h.state.selectResult = { data: { status: "Draft" }, error: null };
    const data = {
      applicants: [
        { surname: "Doe", given_names: "Jane" },
        { surname: "", given_names: "" },
      ],
      loan_amount_sought: 250000,
    };
    const res = await PATCH(jsonReq("PATCH", { data }), params("na-1"));
    expect(res.status).toBe(200);
    const patch = docCall("update")?.payload as Record<string, unknown>;
    expect(patch.applicant_name).toBe("Doe, Jane");
    expect(patch.loan_amount).toBe(250000);
    expect(patch.updated_by).toBe("advisor@nextkey.com.au");

    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as Record<string, unknown>).action).toBe("update");
  });

  it("REJECTS an in-place edit of a locked (Complete) document with 409 and never updates", async () => {
    h.state.selectResult = { data: { status: "Complete" }, error: null };
    const res = await PATCH(jsonReq("PATCH", { data: {} }), params("na-1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: LOCKED_EDIT_MESSAGE });
    expect(docCall("update")).toBeUndefined();
    expect(auditCalls()).toHaveLength(0);
  });

  it("404s when the target row is missing", async () => {
    h.state.selectResult = { data: null, error: null };
    const res = await PATCH(jsonReq("PATCH", { data: {} }), params("nope"));
    expect(res.status).toBe(404);
    expect(docCall("update")).toBeUndefined();
  });
});

describe("DELETE (remove a needs analysis)", () => {
  it("deletes an unlocked document and records a delete audit", async () => {
    h.state.selectResult = { data: { status: "Draft", data: {} }, error: null };
    const res = await DELETE(jsonReq("DELETE"), params("na-1"));
    expect(res.status).toBe(200);
    expect(docCall("delete")?.table).toBe(DOC_TABLE);
    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as Record<string, unknown>).action).toBe("delete");
  });

  it("BLOCKS deletion of a locked (Complete) document with 409 and never deletes", async () => {
    h.state.selectResult = { data: { status: "Complete", data: {} }, error: null };
    const res = await DELETE(jsonReq("DELETE"), params("na-1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: LOCKED_DELETE_MESSAGE });
    expect(docCall("delete")).toBeUndefined();
    expect(auditCalls()).toHaveLength(0);
  });
});

describe("GET (needs analysis history)", () => {
  it("returns the audit trail rows", async () => {
    const rows = [{ id: "a1", doc_type: "needs_analysis", action: "create" }];
    h.state.historyResult = { data: rows, error: null };
    const res = await historyGet(jsonReq("GET"), params("na-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, history: rows });
    const call = h.state.calls.find((c) => c.table === AUDIT_TABLE && c.op === "select");
    expect(call?.cols).toBe("id,doc_type,doc_id,action,changed_by,changed_at,status_after,note");
    expect(call?.cols).not.toContain("data_snapshot");
  });
});
