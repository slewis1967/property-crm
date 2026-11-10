import { describe, it, expect } from "vitest";
import { newToken, hashToken, safeEqual } from "./sign-token";

describe("newToken", () => {
  it("returns a raw token and its SHA-256 hex hash", () => {
    const { raw, hash } = newToken();
    expect(typeof raw).toBe("string");
    expect(raw.length).toBeGreaterThan(20);
    // SHA-256 hex is always 64 chars.
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(raw));
  });

  it("is base64url (URL-path safe — no +, /, = or whitespace)", () => {
    for (let i = 0; i < 50; i++) {
      const { raw } = newToken();
      expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("never repeats a token or a hash across many draws", () => {
    const raws = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { raw, hash } = newToken();
      raws.add(raw);
      hashes.add(hash);
    }
    expect(raws.size).toBe(500);
    expect(hashes.size).toBe(500);
  });
});

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("differs for different input", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("safeEqual", () => {
  it("true for identical strings", () => {
    const h = hashToken("token-value");
    expect(safeEqual(h, h)).toBe(true);
  });

  it("false for different strings of equal length", () => {
    expect(safeEqual("a".repeat(64), "b".repeat(64))).toBe(false);
  });

  it("false for length mismatch (no throw)", () => {
    expect(safeEqual("short", "much-longer-string")).toBe(false);
  });

  it("false for non-string input without throwing", () => {
    // @ts-expect-error intentional misuse — must not throw
    expect(safeEqual(null, "x")).toBe(false);
  });
});
