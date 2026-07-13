import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

/**
 * CHARACTERIZATION tests for the Credit File Authorisation compliance-document
 * routes (list + POST create in ./route, GET one / PATCH / DELETE in
 * ./[id]/route, and the audit trail in ./[id]/history/route).
 *
 * Pins CURRENT behavior before the shared-helper dedup and must keep passing
 * UNCHANGED afterwards. This document differs from the other two: its status
 * lives INSIDE the `data` blob (data.status), its terminal/locked status is
 * `signed` (not `Complete`), and its denormalized column is `names`. Behaviors
 * pinned: PII-safe LIST_COLUMNS (never `*`), the NARROW table-missing check, the
 * exact table name `credit_authorisations`, the locked (`signed`) edit/delete
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

const DOC_TABLE = "credit_authorisations";
const AUDIT_TABLE = "compliance_document_audit";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function jsonReq(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/credit-authorisations/x", {
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
  h.state.insertResult = { data: { id: "ca-1" }, error: null };
  h.state.updateResult = { data: null, error: null };
  h.state.deleteResult = { data: null, error: null };
  h.state.auditInsertResult = { data: null, error: null };
  h.state.historyResult = { data: [], error: null };
});

afterEach(() => vi.clearAllMocks());

describe("GET (list credit authorisations)", () => {
  it("selects the explicit PII-safe LIST_COLUMNS — never `*` — from credit_authorisations", async () => {
    h.state.selectResult = { data: [{ id: "ca-1", names: "John Smith" }], error: null };
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, creditAuthorisations: [{ id: "ca-1", names: "John Smith" }] });
    const call = docCall("select");
    expect(call?.table).toBe(DOC_TABLE);
    expect(call?.cols).toBe("id,names,status,contact_id,deal_id,created_by,created_at,updated_at");
    expect(call?.cols).not.toContain("*");
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
    expect(await res.json()).toEqual({ ok: true, creditAuthorisations: [] });
  });

  it("does NOT treat a column-level error (PGRST204) as a missing table — surfaces a 500", async () => {
    h.state.selectResult = { data: null, error: { code: "PGRST204", message: "Could not find the 'x' column" } };
    const res = await listGet(jsonReq("GET"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
  });
});

describe("POST (create a credit authorisation)", () => {
  it("inserts denormalized `names`, defaults status draft (from the blob), and records a create audit", async () => {
    const data = { names: "John Smith & Jane Smith", address: "1 Example St" };
    const res = await POST(jsonReq("POST", { data }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: "ca-1" });

    const ins = docCall("insert");
    const row = ins?.payload as Record<string, unknown>;
    expect(ins?.table).toBe(DOC_TABLE);
    expect(row.status).toBe("draft");
    expect(row.names).toBe("John Smith & Jane Smith");
    expect(row.created_by).toBe("advisor@nextkey.com.au");

    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    const a = audit[0].payload as Record<string, unknown>;
    expect(a.doc_type).toBe("credit_authorisation");
    expect(a.action).toBe("create");
    expect(a.doc_id).toBe("ca-1");
    expect(a.status_after).toBe("draft");
  });

  it("prefills the name/address lines from a contact when `contactId` is sent (personal details)", async () => {
    // No explicit blob, just a contactId — the create must seed the "I ___ of ___"
    // name and address lines from the linked contact.
    h.state.contactResult = {
      data: {
        full_name: "John Smith",
        home_address_street: "12 Example St",
        home_address_suburb: "Sampleville",
        home_address_state: "QLD",
        home_address_postcode: "4000",
      },
      error: null,
    };
    const res = await POST(jsonReq("POST", { contactId: "c-1" }));
    expect(res.status).toBe(200);

    const row = docCall("insert")?.payload as {
      names: string | null;
      contact_id: string | null;
      data: { names: string; address: string };
    };
    expect(row.contact_id).toBe("c-1");
    expect(row.names).toBe("John Smith");
    expect(row.data.names).toBe("John Smith");
    expect(row.data.address).toBe("12 Example St, Sampleville, QLD, 4000");
    expect(h.state.calls.some((c) => c.table === "contacts")).toBe(true);
  });

  it("lets an explicit `data` blob win over `contactId` (no contact prefill)", async () => {
    h.state.contactResult = { data: { full_name: "Should Not Win" }, error: null };
    const data = { names: "Jane Doe", address: "2 Example St" };
    const res = await POST(jsonReq("POST", { contactId: "c-1", data }));
    expect(res.status).toBe(200);
    const row = docCall("insert")?.payload as { names: string | null; data: { names: string } };
    expect(row.data.names).toBe("Jane Doe");
    expect(row.names).toBe("Jane Doe");
    expect(h.state.calls.some((c) => c.table === "contacts")).toBe(false);
  });

  it("returns the MIGRATION_HINT with 501 when the table is missing on insert", async () => {
    h.state.insertResult = { data: null, error: { code: "42P01", message: "relation does not exist" } };
    const res = await POST(jsonReq("POST", { data: {} }));
    expect(res.status).toBe(501);
    expect(((await res.json()) as { error: string }).error).toContain("Credit Authorisation storage isn't set up");
  });
});

describe("GET (one credit authorisation)", () => {
  it("returns the hydrated document from credit_authorisations via explicit columns", async () => {
    h.state.selectResult = { data: { id: "ca-9", status: "draft", data: { names: "John Smith" } }, error: null };
    const res = await oneGet(jsonReq("GET"), params("ca-9"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; creditAuthorisation: { id: string; data: { names: string } } };
    expect(body.ok).toBe(true);
    expect(body.creditAuthorisation.id).toBe("ca-9");
    expect(body.creditAuthorisation.data.names).toBe("John Smith");
    const call = docCall("select");
    expect(call?.table).toBe(DOC_TABLE);
    expect(call?.cols).not.toContain("*");
  });

  it("404s when the row does not exist", async () => {
    h.state.selectResult = { data: null, error: null };
    const res = await oneGet(jsonReq("GET"), params("missing"));
    expect(res.status).toBe(404);
  });
});

describe("PATCH (save a credit authorisation)", () => {
  it("updates a draft, re-derives `names`/`status` from the blob, and records an update audit", async () => {
    h.state.selectResult = { data: { status: "draft" }, error: null };
    const data = { names: "Jane Doe", address: "2 Example St", status: "draft" };
    const res = await PATCH(jsonReq("PATCH", { data }), params("ca-1"));
    expect(res.status).toBe(200);
    const patch = docCall("update")?.payload as Record<string, unknown>;
    expect(patch.names).toBe("Jane Doe");
    expect(patch.status).toBe("draft");
    expect(patch.updated_by).toBe("advisor@nextkey.com.au");

    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as Record<string, unknown>).action).toBe("update");
  });

  it("REJECTS an in-place edit of a locked (signed) document with 409 and never updates", async () => {
    h.state.selectResult = { data: { status: "signed" }, error: null };
    const res = await PATCH(jsonReq("PATCH", {}), params("ca-1"));
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

describe("DELETE (remove a credit authorisation)", () => {
  it("deletes an unlocked document and records a delete audit", async () => {
    h.state.selectResult = { data: { status: "draft", data: { names: "x" } }, error: null };
    const res = await DELETE(jsonReq("DELETE"), params("ca-1"));
    expect(res.status).toBe(200);
    expect(docCall("delete")?.table).toBe(DOC_TABLE);
    const audit = auditCalls();
    expect(audit).toHaveLength(1);
    expect((audit[0].payload as Record<string, unknown>).action).toBe("delete");
  });

  it("BLOCKS deletion of a locked (signed) document with 409 and never deletes", async () => {
    h.state.selectResult = { data: { status: "signed", data: {} }, error: null };
    const res = await DELETE(jsonReq("DELETE"), params("ca-1"));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: LOCKED_DELETE_MESSAGE });
    expect(docCall("delete")).toBeUndefined();
    expect(auditCalls()).toHaveLength(0);
  });
});

describe("GET (credit authorisation history)", () => {
  it("returns the audit trail rows", async () => {
    const rows = [{ id: "a1", doc_type: "credit_authorisation", action: "create" }];
    h.state.historyResult = { data: rows, error: null };
    const res = await historyGet(jsonReq("GET"), params("ca-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, history: rows });
    const call = h.state.calls.find((c) => c.table === AUDIT_TABLE && c.op === "select");
    expect(call?.cols).toBe("id,doc_type,doc_id,action,changed_by,changed_at,status_after,note");
    expect(call?.cols).not.toContain("data_snapshot");
  });
});
