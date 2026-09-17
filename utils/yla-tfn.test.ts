import { describe, it, expect } from "vitest";
import {
  parseVisualVerdict,
  visualCheckPrompt,
  visualIssues,
  tfnBlocker,
  hasTfnBlocker,
  TFN_BLOCKER,
} from "./yla-verification";

describe("the model is asked about a TFN", () => {
  it("asks on every document type, not just ATO statements", () => {
    for (const key of ["payslip", "photo_id", "ato_income", "super_statement"]) {
      expect(visualCheckPrompt(key)).toContain("showsTfn");
    }
  });

  // The header of Mark Libman's statements carries an ABN, Marcia's a TFN.
  // Confusing the two would hold every sole trader's application forever.
  it("tells the model what is NOT a TFN", () => {
    const p = visualCheckPrompt("ato_income");
    expect(p).toContain("ABN");
    expect(p).toContain("9-digit");
  });

  // A redacted document must PASS, or nothing the redactor produces could ever
  // clear the gate — the first hand-redacted file was held on exactly this.
  it("tells the model a blacked-out number is not a readable one", () => {
    const p = visualCheckPrompt("super_statement");
    expect(p).toContain("blacked out");
    expect(p.toLowerCase()).toContain("legible");
  });

  it("includes showsTfn in the JSON shape it demands", () => {
    expect(visualCheckPrompt("payslip")).toContain('"showsTfn": true/false');
  });
});

describe("parsing", () => {
  it("reads a reported TFN", () => {
    expect(parseVisualVerdict('{"legible":true,"correctType":true,"showsTfn":true}').showsTfn).toBe(true);
  });

  it("reads its absence", () => {
    expect(parseVisualVerdict('{"legible":true,"correctType":true,"showsTfn":false}').showsTfn).toBe(false);
  });

  // Every other field defaults to the pessimistic value. This one must not: a
  // phantom TFN raises a blocker no client and no rep can clear.
  it("does not invent a TFN from a garbled reply", () => {
    const v = parseVisualVerdict("not json at all");
    expect(v.showsTfn).toBe(false);
    expect(v.isScreenshot).toBe(true); // the existing pessimism is untouched
  });

  it("keeps a TFN out of the client-facing issue list", () => {
    const v = parseVisualVerdict('{"legible":true,"correctType":true,"isScreenshot":false,"rotated":false,"showsTfn":true}');
    // The client cannot remove a TFN from an ATO print; telling them to
    // re-upload would loop forever.
    expect(visualIssues(v)).toEqual([]);
  });
});

describe("the blocker", () => {
  it("names the applicant and the file", () => {
    const b = tfnBlocker("Marcia Libman", "ATO Income Statement 1 - Libman (NK-10017).pdf");
    expect(b).toContain("Marcia Libman");
    expect(b).toContain("ATO Income Statement 1");
    expect(b).toContain(TFN_BLOCKER);
  });

  it("is recognised by the export gate", () => {
    const issues = [{ filename: null, issues: [tfnBlocker("Marcia Libman", "ATO Income Statement 1.pdf")] }];
    expect(hasTfnBlocker(issues)).toBe(true);
  });

  it("does not fire on an ordinary failure", () => {
    expect(hasTfnBlocker([{ filename: "x.pdf", issues: ["not clearly legible", "rotated / not upright"] }])).toBe(false);
  });

  it("treats a set with no recorded verdict as clear", () => {
    expect(hasTfnBlocker(null)).toBe(false);
    expect(hasTfnBlocker([])).toBe(false);
  });
});
