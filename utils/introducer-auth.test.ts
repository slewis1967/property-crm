import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The introducer sign-in path, pinned where it matters.
 *
 * These cover the hardening ported from the partner portal after the 2026-09-11
 * security review: an attempt is spent with a compare-and-set BEFORE the code is
 * compared, so parallel guesses can't share one of the five attempts. The two
 * portals must stay in step — utils/partner-auth.test.ts has the twin of this.
 */

type Query = { table: string; op: "select" | "update" | "insert"; filters: Record<string, unknown>; payload: unknown };
const store: {
  queried: string[];
  updates: { table: string; row: Record<string, unknown> }[];
  inserts: { table: string; row: unknown }[];
  handler: ((q: Query) => unknown) | null;
} = { queried: [], updates: [], inserts: [], handler: null };

vi.mock("./supabase", () => ({
  supabase: {
    from(table: string) {
      store.queried.push(table);
      const q: Query = { table, op: "select", filters: {}, payload: null };
      const api = {
        select: () => api,
        update: (row: Record<string, unknown>) => ((q.op = "update"), (q.payload = row), store.updates.push({ table, row }), api),
        insert: (row: unknown) => ((q.op = "insert"), (q.payload = row), store.inserts.push({ table, row }), api),
        eq: (col: string, val: unknown) => ((q.filters[col] = val), api),
        is: (col: string, val: unknown) => ((q.filters[col] = val), api),
        gte: () => api,
        order: () => api,
        limit: () => api,
        maybeSingle: () => Promise.resolve({ data: store.handler ? store.handler(q) : null, error: null }),
        single: () => Promise.resolve({ data: store.handler ? store.handler(q) : null, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      };
      return api;
    },
  },
}));

const { redeemCode } = await import("./introducer-auth");
const { createHash } = await import("node:crypto");

const CODE = "123456";
const codeRow = {
  id: "code-1",
  introducer_user_id: "user-1",
  link_token_hash: "unused",
  code_hash: createHash("sha256").update(CODE, "utf8").digest("hex"),
  attempts: 2,
  expires_at: new Date(Date.now() + 600_000).toISOString(),
  consumed_at: null,
};

/** A world where the claim (the conditional attempts update) wins or loses. */
function world(claimWins: boolean) {
  store.handler = (q) => {
    if (q.table === "introducer_users") {
      return q.filters.id
        ? {
            id: "user-1",
            introducer_id: "firm-1",
            email: "intro@example.com",
            full_name: "Pat",
            is_primary: true,
            status: "active",
            introducers: { firm_name: "Example Introducers", status: "active" },
          }
        : { id: "user-1" };
    }
    if (q.table === "introducer_login_codes" && q.op === "select") return codeRow;
    if (q.table === "introducer_login_codes" && q.op === "update") {
      if ("attempts" in (q.payload as object)) return claimWins ? { id: "code-1" } : null;
      return { id: "code-1" }; // consume
    }
    if (q.table === "introducer_sessions" && q.op === "insert") return { id: "sess-1" };
    return null;
  };
}

beforeEach(() => {
  store.queried = [];
  store.updates = [];
  store.inserts = [];
  store.handler = null;
});

describe("redeemCode — the attempt is spent before the code is compared", () => {
  it("claims with a compare-and-set on the attempt count it read", async () => {
    world(true);
    await redeemCode("intro@example.com", "000000");
    expect(store.updates[0].row).toEqual({ attempts: 3 });
  });

  it("a guess that loses the race to a parallel guess is never compared — even a correct one", async () => {
    world(false);
    const r = await redeemCode("intro@example.com", CODE);
    expect(r.ok).toBe(false);
    expect(store.inserts.find((i) => i.table === "introducer_sessions")).toBeUndefined();
  });

  it("a wrong code that wins the claim still fails, having spent its attempt", async () => {
    world(true);
    const r = await redeemCode("intro@example.com", "000000");
    expect(r.ok).toBe(false);
    expect(store.updates).toHaveLength(1);
  });

  it("the right code that wins the claim signs in", async () => {
    world(true);
    const r = await redeemCode("intro@example.com", CODE);
    expect(r).toMatchObject({ ok: true });
    expect(store.inserts.find((i) => i.table === "introducer_sessions")).toBeDefined();
  });

  it("refuses a malformed code without touching the database", async () => {
    world(true);
    expect((await redeemCode("intro@example.com", "12")).ok).toBe(false);
    expect(store.queried).toEqual([]);
  });
});
