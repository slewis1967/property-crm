import { describe, it, expect } from "vitest";
import { getDb } from "./db";

describe("getDb", () => {
  it("returns a query-capable client (the data-access chokepoint)", () => {
    const db = getDb();
    expect(typeof db.from).toBe("function");
    expect(typeof db.rpc).toBe("function");
  });

  it("is behaviour-preserving today: same instance with or without context", () => {
    // Until multi-tenant, context is a no-op and the same service client is
    // returned. This test will be replaced when getDb() becomes org-scoped.
    expect(getDb({ orgId: "x", userEmail: "a@b.c" })).toBe(getDb());
  });
});
