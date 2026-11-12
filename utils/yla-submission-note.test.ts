import { describe, it, expect, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));
vi.mock("./pdf/render", () => ({ htmlToPdf: vi.fn() }));

import { combineNotes, advisorNotesHtml } from "./yla-submission-note";

describe("combineNotes", () => {
  it("trims, drops blanks and duplicates, and joins siblings", () => {
    expect(combineNotes([" a ", null, "", "a", "b"])).toBe("a\n\nb");
  });
  it("returns null when nothing is left", () => {
    expect(combineNotes([null, "  ", undefined])).toBeNull();
  });
});

describe("advisorNotesHtml", () => {
  it("heads the page with the applicant and reference and escapes the note", () => {
    const html = advisorNotesHtml({
      note: "Rent is <projected>",
      primaryApplicant: "Sonia Louise Crampton",
      clientRef: "NK-10019",
      date: new Date("2026-11-12T00:00:00Z"),
    });
    expect(html).toContain("Advisor Notes");
    expect(html).toContain("Sonia Louise Crampton (NK-10019)");
    expect(html).toContain("12 November 2026");
    expect(html).toContain("Rent is &lt;projected&gt;");
  });
});
