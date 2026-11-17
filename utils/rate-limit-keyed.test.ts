import { describe, expect, it } from "vitest";
import { enforceKeyedRateLimit } from "./rate-limit";

describe("enforceKeyedRateLimit", () => {
  it("counts per exact key, so a different URL or query string can't reset it", () => {
    const key = `test:${Math.random()}`;
    expect(enforceKeyedRateLimit(key, { windowMs: 60_000, max: 2 })).toBeNull();
    expect(enforceKeyedRateLimit(key, { windowMs: 60_000, max: 2 })).toBeNull();
    expect(enforceKeyedRateLimit(key, { windowMs: 60_000, max: 2 })?.status).toBe(429);
    expect(enforceKeyedRateLimit(`${key}:other`, { windowMs: 60_000, max: 2 })).toBeNull();
  });
});
