import { describe, expect, it } from "vitest";
import {
  parseCheckReply,
  parseDraft,
  parseDraftReply,
  publishedGuide,
  screenQuestion,
  statusAfterPreparing,
  type HelpRequestRow,
} from "./requests";

describe("screenQuestion", () => {
  it("accepts a plain task", () => {
    expect(screenQuestion("How do I change a contact's buyer type?")).toBeNull();
  });

  it("refuses text that carries someone's details", () => {
    expect(screenQuestion("How do I email jane.citizen@example.com a report?")).toMatch(/email/i);
    expect(screenQuestion("Client on 0491 570 101 wants a callback, how?")).toMatch(/numbers/i);
    expect(screenQuestion("Where do I enter TFN 123 456 782 for a client?")).toMatch(/numbers/i);
  });

  it("refuses too little or too much", () => {
    expect(screenQuestion("help")).not.toBeNull();
    expect(screenQuestion("x".repeat(401))).not.toBeNull();
  });
});

describe("parseDraftReply", () => {
  const guide = { title: "Do a thing", summary: "It does the thing.", steps: [{ title: "Click A" }, { title: "Click B", detail: "Top right" }] };

  it("reads an answer", () => {
    const r = parseDraftReply(`Here you go: ${JSON.stringify({ verdict: "answer", reason: "Covered.", guide })}`);
    expect(r.screen.verdict).toBe("answer");
    expect(r.draft?.steps).toHaveLength(2);
  });

  it("keeps a decline as a decline", () => {
    const r = parseDraftReply(JSON.stringify({ verdict: "decline", reason: "Skips CDD." }));
    expect(r.screen).toMatchObject({ verdict: "decline", reason: "Skips CDD." });
    expect(r.draft).toBeNull();
  });

  it("refers when the answer has no usable guide, or is unreadable", () => {
    expect(parseDraftReply(JSON.stringify({ verdict: "answer", guide: { title: "x", summary: "y", steps: [] } })).screen.verdict).toBe("refer");
    expect(parseDraftReply("sorry, no").screen.verdict).toBe("refer");
  });
});

describe("parseCheckReply", () => {
  it("passes only a clean, readable result", () => {
    expect(parseCheckReply('{"pass":true,"concerns":[]}').pass).toBe(true);
    expect(parseCheckReply('{"pass":true,"concerns":["Explains how to skip screening."]}').pass).toBe(false);
    expect(parseCheckReply('{"pass":false,"concerns":[]}').pass).toBe(false);
    expect(parseCheckReply("not json").pass).toBe(false);
  });
});

describe("statusAfterPreparing", () => {
  it("never files a flagged request as a ready draft", () => {
    expect(statusAfterPreparing({ verdict: "answer", reason: "", concerns: [] }, true)).toBe("drafted");
    expect(statusAfterPreparing({ verdict: "answer", reason: "", concerns: ["x"] }, false)).toBe("blocked");
    expect(statusAfterPreparing({ verdict: "decline", reason: "", concerns: [] }, true)).toBe("blocked");
    expect(statusAfterPreparing({ verdict: "refer", reason: "", concerns: [] }, true)).toBe("refer");
  });
});

describe("parseDraft and publishedGuide", () => {
  it("drops empty steps and needs at least two", () => {
    expect(parseDraft({ title: "T", summary: "S", steps: [{ title: "One" }, { title: "  " }] })).toBeNull();
    expect(parseDraft({ title: "T", summary: "S", steps: [{ title: "One" }, { title: "Two" }] })?.steps).toHaveLength(2);
  });

  it("only turns a published row into a guide", () => {
    const row = {
      id: "abc",
      status: "drafted",
      draft: { title: "T", summary: "S", steps: [{ title: "One" }, { title: "Two" }] },
    } as HelpRequestRow;
    expect(publishedGuide(row)).toBeNull();
    expect(publishedGuide({ ...row, status: "published" })?.id).toBe("request-abc");
  });
});
