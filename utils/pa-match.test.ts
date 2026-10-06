/**
 * PA matching — the rules that decide whose credit proposal this is.
 *
 * The pure helpers carry the decisions. The wrapper is exercised against a fake
 * Supabase with a store (not per-call mocks) because what matters is the DATA
 * afterwards: who got matched, what was retired, which requests were stamped.
 * The fake implements only the chains utils/pa-match.ts uses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "neq" | "is" | "in" | "ilike"; col: string; val: unknown };

const store: { tables: Record<string, Row[]>; errors: Record<string, { code: string; message: string }> } = {
  tables: {},
  errors: {},
};

/** ILIKE with `\` escapes, as Postgres evaluates it. */
function ilike(value: unknown, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%" || c === "*") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return typeof value === "string" && new RegExp(`^${re}$`, "i").test(value);
}

function matches(row: Row, f: Filter): boolean {
  const v = row[f.col];
  if (f.kind === "eq") return v === f.val;
  if (f.kind === "neq") return v !== f.val;
  if (f.kind === "is") return (v ?? null) === f.val;
  if (f.kind === "in") return (f.val as unknown[]).includes(v);
  return ilike(v, String(f.val));
}

function builder(table: string) {
  const filters: Filter[] = [];
  let payload: Row | null = null;
  const q = {
    select: () => q,
    update: (p: Row) => ((payload = p), q),
    order: () => q,
    limit: () => q,
    eq: (col: string, val: unknown) => (filters.push({ kind: "eq", col, val }), q),
    neq: (col: string, val: unknown) => (filters.push({ kind: "neq", col, val }), q),
    is: (col: string, val: unknown) => (filters.push({ kind: "is", col, val }), q),
    in: (col: string, val: unknown) => (filters.push({ kind: "in", col, val }), q),
    ilike: (col: string, val: unknown) => (filters.push({ kind: "ilike", col, val }), q),
    then: (resolve: (r: { data: Row[] | null; error: unknown }) => unknown) => {
      if (store.errors[table]) return resolve({ data: null, error: store.errors[table] });
      const hit = (store.tables[table] ?? []).filter((r) => filters.every((f) => matches(r, f)));
      if (payload) for (const r of hit) Object.assign(r, payload);
      return resolve({ data: hit.map((r) => ({ ...r })), error: null });
    },
  };
  return q;
}

vi.mock("./supabase", () => ({ supabase: { from: (table: string) => builder(table) } }));

import {
  applicantEmails,
  isUuid,
  matchPendingPas,
  paTableMissing,
  pickContact,
  pickDocumentRequest,
  rowsToSupersede,
  type DocRequestCandidate,
} from "./pa-match";

const PA = "preliminary_assessments";

const pa = (over: Row): Row => ({
  id: "pa-1",
  yla_ref: "9227",
  received_at: "2026-09-28T03:47:49Z",
  status: "Received",
  contact_id: null,
  document_request_id: null,
  matched_by: null,
  data: {
    applicants: [
      { name: "Marcia LIBMAN", email: "marcia@example.com" },
      { name: "Mark LIBMAN", email: "mark@example.com" },
    ],
  },
  ...over,
});

const req = (over: Partial<DocRequestCandidate>): DocRequestCandidate => ({
  id: "dr-1",
  application_id: null,
  applicant_email: "marcia@example.com",
  yla_submitted_at: null,
  pa_received_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  vi.unstubAllEnvs();
  store.tables = { [PA]: [], contacts: [], document_requests: [] };
  store.errors = {};
});

describe("paTableMissing", () => {
  it("matches the table-level codes only", () => {
    expect(paTableMissing({ code: "42P01" })).toBe(true);
    expect(paTableMissing({ code: "PGRST205" })).toBe(true);
    // Column-level errors mean the table exists — "run the migration" would be a lie.
    expect(paTableMissing({ code: "42703" })).toBe(false);
    expect(paTableMissing({ code: "PGRST204" })).toBe(false);
    expect(paTableMissing(null)).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts a uuid and rejects anything that could reach a filter", () => {
    expect(isUuid("3f2c1d7e-8a4b-4c1d-9e2f-0a1b2c3d4e5f")).toBe(true);
    expect(isUuid("contact-1")).toBe(false);
    expect(isUuid("3f2c1d7e-8a4b-4c1d-9e2f-0a1b2c3d4e5f,status.eq.Signed")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("applicantEmails", () => {
  it("keeps applicant order, lower-cases, and drops blanks and repeats", () => {
    expect(
      applicantEmails({
        applicants: [
          { name: "A", email: "Marcia@Example.com " },
          { name: "B", email: "" },
          { name: "C", email: "mark@example.com" },
          { name: "D", email: "MARCIA@example.com" },
        ],
      }),
    ).toEqual(["marcia@example.com", "mark@example.com"]);
  });

  it("survives a malformed blob", () => {
    expect(applicantEmails(null)).toEqual([]);
    expect(applicantEmails({ applicants: "nope" })).toEqual([]);
  });
});

describe("pickContact", () => {
  it("matches case-insensitively", () => {
    expect(pickContact(["marcia@example.com"], [{ id: "c1", email: " Marcia@Example.COM" }])).toBe("c1");
  });

  it("gives the first applicant's contact when applicants map to different contacts", () => {
    const contacts = [
      { id: "c-mark", email: "mark@example.com" },
      { id: "c-marcia", email: "marcia@example.com" },
    ];
    expect(pickContact(["marcia@example.com", "mark@example.com"], contacts)).toBe("c-marcia");
  });

  it("falls to the second applicant when the first has no contact", () => {
    expect(
      pickContact(["marcia@example.com", "mark@example.com"], [{ id: "c-mark", email: "mark@example.com" }]),
    ).toBe("c-mark");
  });

  it("returns null with no email hit — never a guess", () => {
    expect(pickContact(["marcia@example.com"], [{ id: "c1", email: "m.libman@example.com" }])).toBeNull();
    expect(pickContact([], [{ id: "c1", email: null }])).toBeNull();
    expect(pickContact([""], [{ id: "c1", email: "" }])).toBeNull();
  });
});

describe("pickDocumentRequest", () => {
  it("prefers a request that was submitted to YLA over a newer one that was not", () => {
    const picked = pickDocumentRequest(
      ["marcia@example.com"],
      [
        req({ id: "abandoned", created_at: "2026-09-20T00:00:00Z" }),
        req({ id: "submitted", created_at: "2026-09-01T00:00:00Z", yla_submitted_at: "2026-09-02T00:00:00Z" }),
      ],
    );
    expect(picked?.id).toBe("submitted");
  });

  it("takes the newest when submission does not separate them", () => {
    const picked = pickDocumentRequest(
      ["marcia@example.com"],
      [req({ id: "old", created_at: "2026-08-01T00:00:00Z" }), req({ id: "new", created_at: "2026-09-01T00:00:00Z" })],
    );
    expect(picked?.id).toBe("new");
  });

  it("ignores requests for other people", () => {
    expect(pickDocumentRequest(["marcia@example.com"], [req({ applicant_email: "other@example.com" })])).toBeNull();
    expect(pickDocumentRequest([], [req({})])).toBeNull();
  });
});

describe("rowsToSupersede", () => {
  const row = (id: string, received_at: string, status: string, yla_ref = "9079") => ({
    id,
    yla_ref,
    received_at,
    status,
  });

  it("retires the older Received/Presented rows of a ref", () => {
    expect(
      rowsToSupersede([
        row("a", "2026-07-30T02:09:34Z", "Presented"),
        row("b", "2026-08-01T08:06:12Z", "Received"),
        row("c", "2026-09-28T03:47:49Z", "Received", "9227"),
      ]),
    ).toEqual(["a"]);
  });

  it("never touches a PA that is out for signature or signed", () => {
    expect(
      rowsToSupersede([
        row("sent", "2026-07-01T00:00:00Z", "Sent for signing"),
        row("signed", "2026-07-02T00:00:00Z", "Signed"),
        row("new", "2026-08-01T00:00:00Z", "Received"),
      ]),
    ).toEqual([]);
  });

  it("counts a newer row of any status as the replacement", () => {
    expect(
      rowsToSupersede([row("old", "2026-07-01T00:00:00Z", "Received"), row("new", "2026-08-01T00:00:00Z", "Signed")]),
    ).toEqual(["old"]);
  });

  it("leaves equal timestamps and unparseable dates alone", () => {
    expect(
      rowsToSupersede([row("a", "2026-07-01T00:00:00Z", "Received"), row("b", "2026-07-01T00:00:00Z", "Received")]),
    ).toEqual([]);
    expect(rowsToSupersede([row("a", "not a date", "Received"), row("b", "2026-07-01T00:00:00Z", "Received")])).toEqual(
      [],
    );
  });
});

describe("matchPendingPas", () => {
  it("returns zeros when the table has not been migrated", async () => {
    store.errors[PA] = { code: "PGRST205", message: "Could not find the table" };
    expect(await matchPendingPas()).toEqual({ matched: 0, superseded: 0, unmatched: 0 });
  });

  it("throws on any other read error instead of reporting a clean zero", async () => {
    store.errors[PA] = { code: "42703", message: "column does not exist" };
    await expect(matchPendingPas()).rejects.toMatchObject({ code: "42703" });
  });

  it("matches on email and stamps how", async () => {
    store.tables[PA] = [pa({})];
    store.tables.contacts = [{ id: "c-marcia", email: "Marcia@Example.com" }];
    expect(await matchPendingPas()).toEqual({ matched: 1, superseded: 0, unmatched: 0 });
    expect(store.tables[PA][0]).toMatchObject({ contact_id: "c-marcia", matched_by: "auto:email" });
    expect(store.tables[PA][0].matched_at).toBeTruthy();
  });

  it("leaves a PA unmatched when no contact has that email, even with the same surname", async () => {
    store.tables[PA] = [pa({})];
    store.tables.contacts = [{ id: "c-other", email: "libman@example.com", name: "Someone LIBMAN" }];
    expect(await matchPendingPas()).toEqual({ matched: 0, superseded: 0, unmatched: 1 });
    expect(store.tables[PA][0].contact_id).toBeNull();
  });

  it("does not let an underscore in an address match a different address", async () => {
    store.tables[PA] = [pa({ data: { applicants: [{ name: "A", email: "a_b@example.com" }] } })];
    store.tables.contacts = [{ id: "wrong", email: "axb@example.com" }];
    expect((await matchPendingPas()).matched).toBe(0);
  });

  it("does not re-match a PA a rep deliberately cleared", async () => {
    store.tables[PA] = [pa({ matched_by: "rep@nextkey.com.au" })];
    store.tables.contacts = [{ id: "c-marcia", email: "marcia@example.com" }];
    expect(await matchPendingPas()).toEqual({ matched: 0, superseded: 0, unmatched: 1 });
    expect(store.tables[PA][0].contact_id).toBeNull();
  });

  it("supersedes the older PA of a ref and matches only the live one", async () => {
    store.tables[PA] = [
      pa({ id: "old", yla_ref: "9079", received_at: "2026-07-30T02:09:34Z" }),
      pa({ id: "new", yla_ref: "9079", received_at: "2026-08-01T08:06:12Z" }),
    ];
    store.tables.contacts = [{ id: "c-marcia", email: "marcia@example.com" }];
    expect(await matchPendingPas()).toEqual({ matched: 1, superseded: 1, unmatched: 0 });
    const byId = Object.fromEntries(store.tables[PA].map((r) => [r.id, r]));
    expect(byId.old).toMatchObject({ status: "Superseded", contact_id: null });
    expect(byId.new).toMatchObject({ status: "Received", contact_id: "c-marcia" });
  });

  it("links the document request but leaves PA-received to a rep by default", async () => {
    store.tables[PA] = [pa({})];
    store.tables.document_requests = [req({ id: "dr-marcia" })];
    await matchPendingPas();
    expect(store.tables[PA][0]).toMatchObject({ document_request_id: "dr-marcia" });
    expect(store.tables.document_requests[0].pa_received_at).toBeNull();
  });

  it("marks the PA received across the application when PA_AUTO_MARK_RECEIVED is on", async () => {
    vi.stubEnv("PA_AUTO_MARK_RECEIVED", "true");
    store.tables[PA] = [pa({})];
    store.tables.document_requests = [
      { ...req({ id: "dr-marcia", application_id: "app-1", yla_submitted_at: "2026-09-20T00:00:00Z" }) },
      { ...req({ id: "dr-mark", application_id: "app-1", applicant_email: "partner@example.com" }) },
      { ...req({ id: "dr-unrelated", application_id: "app-2", applicant_email: "x@example.com" }) },
    ];
    await matchPendingPas();
    const dr = Object.fromEntries(store.tables.document_requests.map((r) => [r.id, r]));
    expect(store.tables[PA][0].document_request_id).toBe("dr-marcia");
    expect(dr["dr-marcia"]).toMatchObject({ pa_received_by: "yla-email-intake" });
    expect(dr["dr-marcia"].pa_received_at).toBeTruthy();
    expect(dr["dr-mark"].pa_received_at).toBeTruthy();
    expect(dr["dr-unrelated"].pa_received_at).toBeNull();
  });

  it("keeps a rep's earlier PA-received stamp", async () => {
    store.tables[PA] = [pa({})];
    store.tables.document_requests = [
      { ...req({ pa_received_at: "2026-09-25T00:00:00Z" }), pa_received_by: "glenn.m@nextkey.com.au" },
    ];
    await matchPendingPas();
    expect(store.tables.document_requests[0]).toMatchObject({
      pa_received_at: "2026-09-25T00:00:00Z",
      pa_received_by: "glenn.m@nextkey.com.au",
    });
    expect(store.tables[PA][0].document_request_id).toBe("dr-1");
  });

  it("still matches the contact when the document-request lookup fails", async () => {
    store.tables[PA] = [pa({})];
    store.tables.contacts = [{ id: "c-marcia", email: "marcia@example.com" }];
    store.errors.document_requests = { code: "42703", message: "column pa_received_at does not exist" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await matchPendingPas()).matched).toBe(1);
    warn.mockRestore();
  });
});
