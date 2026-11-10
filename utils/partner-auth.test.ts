import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * resolveSession is the gate on every partner request. These pin the security
 * properties utils/partner-auth.ts shares with the introducer portal: a revoked
 * or expired session is dead, and suspending the person OR the firm locks them
 * out on the next click — plus the partner-specific ones: tier, features and
 * branding come from the firm row, never from the caller, and default narrow.
 */

type SessionRow = Record<string, unknown> | null;
type Query = { table: string; op: "select" | "update" | "insert"; filters: Record<string, unknown>; payload: unknown };
const store: {
  session: SessionRow;
  queried: string[];
  updates: Record<string, unknown>[];
  inserts: { table: string; row: unknown }[];
  /** Per-test override for maybeSingle; falls back to `session`. */
  handler: ((q: Query) => unknown) | null;
} = { session: null, queried: [], updates: [], inserts: [], handler: null };

vi.mock("./supabase", () => ({
  supabase: {
    from(table: string) {
      store.queried.push(table);
      const q: Query = { table, op: "select", filters: {}, payload: null };
      const api = {
        select: () => api,
        update: (row: Record<string, unknown>) => ((q.op = "update"), (q.payload = row), store.updates.push(row), api),
        insert: (row: unknown) => ((q.op = "insert"), (q.payload = row), store.inserts.push({ table, row }), api),
        eq: (col: string, val: unknown) => ((q.filters[col] = val), api),
        is: (col: string, val: unknown) => ((q.filters[col] = val), api),
        order: () => api,
        limit: () => api,
        maybeSingle: () =>
          Promise.resolve({ data: store.handler ? store.handler(q) : store.session, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok),
      };
      return api;
    },
  },
}));

const { resolveSession, redeemCode } = await import("./partner-auth");
const { createHash } = await import("node:crypto");

const TOKEN = "x".repeat(43);
const future = () => new Date(Date.now() + 86_400_000).toISOString();

function session(overrides: {
  revoked_at?: string | null;
  expires_at?: string;
  userStatus?: string;
  firmStatus?: string;
  tier?: string;
  grants?: unknown;
  branding?: unknown;
  last_seen_at?: string;
} = {}): SessionRow {
  return {
    id: "sess-1",
    partner_id: "firm-1",
    expires_at: overrides.expires_at ?? future(),
    revoked_at: overrides.revoked_at ?? null,
    last_seen_at: overrides.last_seen_at ?? new Date().toISOString(),
    partner_users: {
      id: "user-1",
      email: "agent@harbour.example",
      full_name: "Pat Agent",
      is_primary: true,
      status: overrides.userStatus ?? "active",
      partners: {
        firm_name: "Harbour Property",
        status: overrides.firmStatus ?? "active",
        tier: overrides.tier ?? "basic",
        feature_grants: overrides.grants ?? [],
        branding: overrides.branding ?? {},
      },
    },
  };
}

beforeEach(() => {
  store.session = null;
  store.queried = [];
  store.updates = [];
  store.inserts = [];
  store.handler = null;
});

describe("redeemCode — the attempt is spent before the code is compared", () => {
  const CODE = "123456";
  const codeRow = {
    id: "code-1",
    partner_user_id: "user-1",
    code_hash: createHash("sha256").update(CODE, "utf8").digest("hex"),
    attempts: 2,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    consumed_at: null,
  };

  /** A world where the claim (the conditional attempts update) wins or loses. */
  function world(claimWins: boolean) {
    store.handler = (q) => {
      if (q.table === "partner_users" && q.op === "select") {
        return q.filters.id
          ? { id: "user-1", partner_id: "firm-1", email: "a@b.co", status: "active", partners: { status: "active" } }
          : { id: "user-1" };
      }
      if (q.table === "partner_login_codes" && q.op === "select") return codeRow;
      if (q.table === "partner_login_codes" && q.op === "update") {
        if ("attempts" in (q.payload as object)) return claimWins ? { id: "code-1" } : null;
        return { id: "code-1" }; // consume
      }
      return null;
    };
  }

  it("claims with a compare-and-set on the attempt count it read", async () => {
    world(true);
    await redeemCode("a@b.co", "000000");
    expect(store.updates[0]).toEqual({ attempts: 3 });
  });

  it("a guess that loses the race to a parallel guess is never compared — even a correct one", async () => {
    world(false);
    const r = await redeemCode("a@b.co", CODE);
    expect(r.ok).toBe(false);
    expect(store.inserts.find((i) => i.table === "partner_sessions")).toBeUndefined();
  });

  it("a wrong code that wins the claim still fails, having spent its attempt", async () => {
    world(true);
    const r = await redeemCode("a@b.co", "000000");
    expect(r.ok).toBe(false);
    expect(store.updates).toHaveLength(1);
  });

  it("the right code that wins the claim signs in", async () => {
    world(true);
    const r = await redeemCode("a@b.co", CODE);
    expect(r).toMatchObject({ ok: true, partnerId: "firm-1" });
    expect(store.inserts.find((i) => i.table === "partner_sessions")).toBeDefined();
  });
});

describe("resolveSession", () => {
  it("resolves an active session to the firm from the database", async () => {
    store.session = session();
    const id = await resolveSession(TOKEN);
    expect(id).toMatchObject({
      partnerId: "firm-1",
      userId: "user-1",
      email: "agent@harbour.example",
      firmName: "Harbour Property",
      tier: "basic",
    });
    expect(id?.features.sort()).toEqual(["clients", "deals", "referral_fee", "stock"]);
    expect(id?.branding.whiteLabel).toBe(false);
  });

  it("does not even query for a token too short to be real", async () => {
    expect(await resolveSession("short")).toBeNull();
    expect(await resolveSession(null)).toBeNull();
    expect(store.queried).toEqual([]);
  });

  it("rejects an unknown token", async () => {
    store.session = null;
    expect(await resolveSession(TOKEN)).toBeNull();
  });

  it("rejects a revoked session", async () => {
    store.session = session({ revoked_at: new Date().toISOString() });
    expect(await resolveSession(TOKEN)).toBeNull();
  });

  it("rejects an expired session", async () => {
    store.session = session({ expires_at: new Date(Date.now() - 1000).toISOString() });
    expect(await resolveSession(TOKEN)).toBeNull();
  });

  it("locks out a suspended login immediately, cookie or not", async () => {
    store.session = session({ userStatus: "suspended" });
    expect(await resolveSession(TOKEN)).toBeNull();
  });

  it("locks out every login at a suspended or terminated firm", async () => {
    store.session = session({ firmStatus: "suspended" });
    expect(await resolveSession(TOKEN)).toBeNull();
    store.session = session({ firmStatus: "terminated" });
    expect(await resolveSession(TOKEN)).toBeNull();
  });

  it("reads an unrecognised tier as basic", async () => {
    store.session = session({ tier: "platinum" });
    const id = await resolveSession(TOKEN);
    expect(id?.tier).toBe("basic");
    expect(id?.features).not.toContain("white_label");
  });

  it("applies white-label branding only when the firm has been granted it", async () => {
    const branding = { display_name: "Harbour", primary_color: "#112233", accent_color: "#445566" };
    store.session = session({ branding });
    expect((await resolveSession(TOKEN))?.branding.whiteLabel).toBe(false);

    store.session = session({ branding, grants: ["white_label"] });
    const id = await resolveSession(TOKEN);
    expect(id?.branding).toMatchObject({ whiteLabel: true, displayName: "Harbour", primaryColor: "#112233" });
  });

  it("slides the expiry at most once a day", async () => {
    store.session = session();
    await resolveSession(TOKEN);
    expect(store.updates).toHaveLength(0);

    store.session = session({ last_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString() });
    await resolveSession(TOKEN);
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0]).toHaveProperty("expires_at");
  });
});
