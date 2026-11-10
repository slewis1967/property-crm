import { describe, it, expect } from "vitest";
import { validateDeletionInput } from "./deletion-log";

describe("validateDeletionInput", () => {
  it("accepts a reason and name, trimming both", () => {
    const r = validateDeletionInput({ reason: "  duplicate lead ", deleter_name: " Sean L " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ reason: "duplicate lead", deleterName: "Sean L" });
    }
  });

  it("rejects a missing reason", () => {
    const r = validateDeletionInput({ deleter_name: "Sean" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reason/i);
  });

  it("rejects a blank / whitespace-only reason", () => {
    const r = validateDeletionInput({ reason: "   ", deleter_name: "Sean" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reason/i);
  });

  it("rejects a missing name", () => {
    const r = validateDeletionInput({ reason: "spam" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });

  it("rejects a blank / whitespace-only name", () => {
    const r = validateDeletionInput({ reason: "spam", deleter_name: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/name/i);
  });

  it("rejects a non-string reason", () => {
    const r = validateDeletionInput({ reason: 123, deleter_name: "Sean" });
    expect(r.ok).toBe(false);
  });

  it("rejects an empty / null / undefined body", () => {
    expect(validateDeletionInput({}).ok).toBe(false);
    expect(validateDeletionInput(null).ok).toBe(false);
    expect(validateDeletionInput(undefined).ok).toBe(false);
  });
});
