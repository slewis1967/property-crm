import { describe, it, expect } from "vitest";
import { deriveAutosaveState, autosaveBackoffMs, relativeTime, AUTOSAVE_DEBOUNCE_MS } from "./useAutosave";

describe("deriveAutosaveState", () => {
  it("saving/error phases win over dirtiness", () => {
    expect(deriveAutosaveState({ phase: "saving", isDirty: true, hasSaved: true })).toBe("saving");
    expect(deriveAutosaveState({ phase: "error", isDirty: true, hasSaved: true })).toBe("error");
  });

  it("shows unsaved when dirty and idle", () => {
    expect(deriveAutosaveState({ phase: "idle", isDirty: true, hasSaved: false })).toBe("unsaved");
    expect(deriveAutosaveState({ phase: "idle", isDirty: true, hasSaved: true })).toBe("unsaved");
  });

  it("shows saved when clean and a save has happened", () => {
    expect(deriveAutosaveState({ phase: "idle", isDirty: false, hasSaved: true })).toBe("saved");
  });

  it("is idle when clean and never saved", () => {
    expect(deriveAutosaveState({ phase: "idle", isDirty: false, hasSaved: false })).toBe("idle");
  });
});

describe("autosaveBackoffMs", () => {
  it("returns the base delay for the first attempt", () => {
    expect(autosaveBackoffMs(0)).toBe(AUTOSAVE_DEBOUNCE_MS);
    expect(autosaveBackoffMs(-1)).toBe(AUTOSAVE_DEBOUNCE_MS);
  });

  it("doubles each attempt", () => {
    expect(autosaveBackoffMs(1)).toBe(AUTOSAVE_DEBOUNCE_MS * 2);
    expect(autosaveBackoffMs(2)).toBe(AUTOSAVE_DEBOUNCE_MS * 4);
    expect(autosaveBackoffMs(3)).toBe(AUTOSAVE_DEBOUNCE_MS * 8);
  });

  it("caps at the ceiling and never hammers", () => {
    expect(autosaveBackoffMs(100)).toBe(30_000);
    expect(autosaveBackoffMs(100)).toBeLessThanOrEqual(30_000);
  });
});

describe("relativeTime", () => {
  const t0 = 1_000_000_000_000;
  it("reads 'just now' within 5s", () => {
    expect(relativeTime(t0, t0)).toBe("just now");
    expect(relativeTime(t0, t0 + 4_000)).toBe("just now");
  });
  it("reports seconds, minutes, hours, days", () => {
    expect(relativeTime(t0, t0 + 42_000)).toBe("42s ago");
    expect(relativeTime(t0, t0 + 3 * 60_000)).toBe("3m ago");
    expect(relativeTime(t0, t0 + 2 * 3_600_000)).toBe("2h ago");
    expect(relativeTime(t0, t0 + 3 * 86_400_000)).toBe("3d ago");
  });
  it("never goes negative for clock skew", () => {
    expect(relativeTime(t0, t0 - 10_000)).toBe("just now");
  });
});
