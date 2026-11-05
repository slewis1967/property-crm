import { describe, expect, it } from "vitest";
import { callNote, isCallOutcome, recordingObjectPath } from "./call-outcome";

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

describe("recordingObjectPath", () => {
  const lead = "d22d6694-0ba3-4c27-96bb-abe7a7d17316";
  it("accepts this lead's own recording and strips the bucket", () => {
    expect(recordingObjectPath(`call-recordings/leads/${lead}/record-1793868496860.mp3`, lead))
      .toBe(`leads/${lead}/record-1793868496860.mp3`);
  });
  it("refuses another lead's recording", () => {
    expect(recordingObjectPath(`call-recordings/leads/other-lead/record-1.mp3`, lead)).toBeNull();
  });
  it("refuses traversal, nesting, other buckets and non-audio", () => {
    expect(recordingObjectPath(`call-recordings/leads/${lead}/../x/record-1.mp3`, lead)).toBeNull();
    expect(recordingObjectPath(`call-recordings/leads/${lead}/a/record-1.mp3`, lead)).toBeNull();
    expect(recordingObjectPath(`client-documents/leads/${lead}/record-1.mp3`, lead)).toBeNull();
    expect(recordingObjectPath(`call-recordings/leads/${lead}/secrets.pdf`, lead)).toBeNull();
    expect(recordingObjectPath(undefined, lead)).toBeNull();
  });
});
