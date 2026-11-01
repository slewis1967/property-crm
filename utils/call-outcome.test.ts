import { describe, expect, it } from "vitest";
import { callNote, isCallOutcome } from "./call-outcome";

describe("call outcomes", () => {
  it("accepts only the known outcomes", () => {
    expect(isCallOutcome("answered")).toBe(true);
    expect(isCallOutcome("no_answer")).toBe(true);
    expect(isCallOutcome("maybe")).toBe(false);
    expect(isCallOutcome("constructor")).toBe(false);
    expect(isCallOutcome(undefined)).toBe(false);
  });

  it("builds a readable note the agent can also parse", () => {
    expect(callNote("voicemail", "2026-11-01T00:00:00.000Z")).toEqual({
      text: "Call: Voicemail",
      created_at: "2026-11-01T00:00:00.000Z",
      call: "voicemail",
    });
  });
});
