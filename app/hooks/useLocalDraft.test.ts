import { describe, it, expect } from "vitest";
import { draftStorageKey, parseStoredDraft } from "./useLocalDraft";

describe("draftStorageKey", () => {
  it("namespaces by doc type and id", () => {
    expect(draftStorageKey("needs_analysis", "abc")).toBe("nk-draft:needs_analysis:abc");
    expect(draftStorageKey("fact_find", "1")).toBe("nk-draft:fact_find:1");
  });
});

describe("parseStoredDraft", () => {
  it("returns null for null / empty / malformed input", () => {
    expect(parseStoredDraft(null)).toBeNull();
    expect(parseStoredDraft("")).toBeNull();
    expect(parseStoredDraft("not json")).toBeNull();
    expect(parseStoredDraft("[1,2,3]")).toBeNull(); // array, no `data`
    expect(parseStoredDraft('{"ts":1}')).toBeNull(); // no `data` key
  });

  it("parses a well-formed draft", () => {
    const draft = parseStoredDraft<{ x: number }>('{"ts":123,"data":{"x":7}}');
    expect(draft).toEqual({ ts: 123, data: { x: 7 } });
  });

  it("defaults a missing/invalid ts to 0 but keeps the data", () => {
    expect(parseStoredDraft('{"data":{"a":1}}')).toEqual({ ts: 0, data: { a: 1 } });
    expect(parseStoredDraft('{"ts":"nope","data":5}')).toEqual({ ts: 0, data: 5 });
  });

  it("preserves falsy data (empty object, empty string)", () => {
    expect(parseStoredDraft('{"ts":1,"data":{}}')).toEqual({ ts: 1, data: {} });
    expect(parseStoredDraft('{"ts":1,"data":""}')).toEqual({ ts: 1, data: "" });
  });
});
