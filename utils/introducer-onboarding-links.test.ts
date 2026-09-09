/**
 * Onboarding links — the guarantee that sending one email does not break the
 * last one.
 *
 * This is the regression test for SBI-2026-0004 and -0005: minting used to
 * overwrite the application's single `token_hash`, so a candidate who opened
 * the "you've passed" email nine seconds after the agreement email followed it
 * was told "We can't open this link", and their certificate sat behind it.
 *
 * Supabase is faked rather than mocked per-call, because what is being asserted
 * is a rule about the DATA — how many links resolve at once — and a fake with a
 * store can answer that. It implements only the chains this module uses.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

type TokenRow = {
  application_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  purpose?: string;
};
type AppRow = Record<string, unknown> & { id: string; token_hash: string; token_expires_at: string };

const store = {
  applications: [] as AppRow[],
  tokens: [] as TokenRow[],
  /** Set to simulate a deploy that has landed before the 20260820 migration. */
  tokenTableMissing: false,
};

const TOKENS = "introducer_application_tokens";

const missing = {
  data: null,
  error: { message: `relation "public.${TOKENS}" does not exist` },
};

function run(q: { table: string; op: string; filters: Record<string, unknown>; payload: unknown }) {
  if (q.table === TOKENS && store.tokenTableMissing) return missing;

  if (q.op === "insert") {
    const row = q.payload as Record<string, unknown>;
    if (q.table === TOKENS) {
      store.tokens.push({
        application_id: row.application_id as string,
        token_hash: row.token_hash as string,
        expires_at: row.expires_at as string,
        purpose: row.purpose as string | undefined,
        revoked_at: null,
      });
    } else {
      store.applications.push(row as unknown as AppRow);
    }
    return { data: row, error: null };
  }

  if (q.op === "update") {
    const target = store.applications.find((a) => a.id === q.filters.id);
    if (target) Object.assign(target, q.payload as Record<string, unknown>);
    return { data: target ?? null, error: null };
  }

  const rows: Record<string, unknown>[] = q.table === TOKENS ? store.tokens : store.applications;
  const hit = rows.find((r) =>
    Object.entries(q.filters).every(([col, val]) => (r as Record<string, unknown>)[col] === val),
  );
  return { data: hit ?? null, error: null };
}

vi.mock("./supabase", () => ({
  supabase: {
    from(table: string) {
      const q = { table, op: "select", filters: {} as Record<string, unknown>, payload: null as unknown };
      const api = {
        select: () => api,
        insert: (row: unknown) => ((q.op = "insert"), (q.payload = row), api),
        update: (row: unknown) => ((q.op = "update"), (q.payload = row), api),
        eq: (col: string, val: unknown) => ((q.filters[col] = val), api),
        maybeSingle: () => Promise.resolve(run(q)),
        single: () => Promise.resolve(run(q)),
        // Insert and update are awaited without a terminator.
        then: (ok: (v: unknown) => unknown, no?: (e: unknown) => unknown) =>
          Promise.resolve(run(q)).then(ok, no),
      };
      return api;
    },
  },
}));

const { findByToken, mintLinkToken } = await import("./introducer-onboarding-db");
const { hashToken } = await import("./sign-token");

const APP_ID = "545f633f-5700-404e-a787-f0b60f718e04";

function seedApplication() {
  store.applications.push({
    id: APP_ID,
    legal_name: "Glenn B Mayes",
    email: "glenn.m@example.com",
    state: "exam_passed",
    token_hash: "seed-hash",
    token_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  });
}

beforeEach(() => {
  store.applications = [];
  store.tokens = [];
  store.tokenTableMissing = false;
  seedApplication();
});

describe("onboarding links", () => {
  it("keeps the previous link alive when the next email is sent", async () => {
    // Exactly the sequence that broke: issue the certificate, then send the
    // agreement nine seconds later.
    const certificateLink = await mintLinkToken(APP_ID, "certificate");
    const agreementLink = await mintLinkToken(APP_ID, "agreement");

    const viaCertificate = await findByToken(certificateLink);
    const viaAgreement = await findByToken(agreementLink);

    expect(viaCertificate.ok).toBe(true);
    expect(viaAgreement.ok).toBe(true);
    expect(viaCertificate.ok && viaCertificate.application.id).toBe(APP_ID);
    expect(viaAgreement.ok && viaAgreement.application.id).toBe(APP_ID);
  });

  it("records why each link was minted, without letting purpose gate anything", async () => {
    await mintLinkToken(APP_ID, "exam");
    await mintLinkToken(APP_ID, "agreement");
    expect(store.tokens.map((t) => t.purpose)).toEqual(["exam", "agreement"]);
  });

  it("still points the application row at the newest link", async () => {
    await mintLinkToken(APP_ID, "certificate");
    const newest = await mintLinkToken(APP_ID, "agreement");
    expect(store.applications[0].token_hash).toBe(hashToken(newest));
  });

  it("reads an expired link as expired, not as unknown", async () => {
    const raw = await mintLinkToken(APP_ID, "invite");
    store.tokens[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const result = await findByToken(raw);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("reads a revoked link as expired too — the holder is a real candidate", async () => {
    const raw = await mintLinkToken(APP_ID, "invite");
    store.tokens[0].revoked_at = new Date().toISOString();

    // "Ask us for a fresh one" is the sentence that helps them; "we can't open
    // this link" sends them hunting for a typo that isn't there.
    const result = await findByToken(raw);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("does not resolve a token nobody minted", async () => {
    const result = await findByToken("never-issued");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("falls back to the application row while the migration is still pending", async () => {
    // Code ships before the SQL is run. Until it does, the old single-link
    // behaviour is what there is — but a send must not fail.
    store.tokenTableMissing = true;

    const older = await mintLinkToken(APP_ID, "certificate");
    const newest = await mintLinkToken(APP_ID, "agreement");

    expect(store.tokens).toHaveLength(0);
    expect((await findByToken(newest)).ok).toBe(true);
    expect(await findByToken(older)).toEqual({ ok: false, reason: "not_found" });
  });
});
