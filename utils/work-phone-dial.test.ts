import { describe, expect, it } from "vitest";
import { DIAL_REQUEST_TTL_MS, dialStatusFor, dialableAU } from "./work-phone-dial";

describe("dialableAU", () => {
  it("accepts AU mobiles in any common format", () => {
    expect(dialableAU("0412 345 678")).toBe("+61412345678");
    expect(dialableAU("+61 412-345-678")).toBe("+61412345678");
    expect(dialableAU("61412345678")).toBe("+61412345678");
    expect(dialableAU("412345678")).toBe("+61412345678");
  });

  it("accepts geographic landlines", () => {
    expect(dialableAU("(07) 5555 1234")).toBe("+61755551234");
    expect(dialableAU("02 9999 0000")).toBe("+61299990000");
  });

  it("refuses premium, toll-free, international and junk", () => {
    expect(dialableAU("1900 123 456")).toBeNull();
    expect(dialableAU("1300 123 456")).toBeNull();
    expect(dialableAU("1800 123 456")).toBeNull();
    expect(dialableAU("+1 415 555 0100")).toBeNull();
    expect(dialableAU("123")).toBeNull();
    expect(dialableAU(null)).toBeNull();
  });
});

describe("dialStatusFor", () => {
  const now = Date.parse("2026-11-11T03:00:00Z");
  const fresh = new Date(now - 5_000).toISOString();
  const stale = new Date(now - DIAL_REQUEST_TTL_MS - 1).toISOString();

  it("reports pending, dialing and failed", () => {
    expect(dialStatusFor({ status: "pending", created_at: fresh }, now).status).toBe("pending");
    expect(dialStatusFor({ status: "dialing", created_at: stale }, now).status).toBe("dialing");
    expect(dialStatusFor({ status: "failed", created_at: fresh, error: "adb offline" }, now).message).toContain("adb offline");
  });

  it("treats a pending request past the TTL as missed", () => {
    expect(dialStatusFor({ status: "pending", created_at: stale }, now).status).toBe("expired");
  });
});
