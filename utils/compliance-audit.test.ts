import { describe, it, expect } from "vitest";
import {
  LOCKED_STATUS,
  isLocked,
  classifyPatch,
  type ComplianceDocType,
} from "./compliance-audit";
import { FACT_FIND_TERMINAL_STATUS } from "./factfind";
import { NEEDS_ANALYSIS_TERMINAL_STATUS } from "./needsAnalysis";
import { CREDIT_AUTHORISATION_TERMINAL_STATUS } from "./creditAuthorisation";

/** The terminal (locked) status for each doc type, and a sample draft value. */
const CASES: { doc: ComplianceDocType; terminal: string; draft: string }[] = [
  { doc: "fact_find", terminal: "Complete", draft: "Draft" },
  { doc: "needs_analysis", terminal: "Complete", draft: "Draft" },
  { doc: "credit_authorisation", terminal: "signed", draft: "draft" },
];

describe("LOCKED_STATUS map", () => {
  it("uses the terminal status constant from each doc util (single source of truth)", () => {
    expect(LOCKED_STATUS.fact_find).toBe(FACT_FIND_TERMINAL_STATUS);
    expect(LOCKED_STATUS.needs_analysis).toBe(NEEDS_ANALYSIS_TERMINAL_STATUS);
    expect(LOCKED_STATUS.credit_authorisation).toBe(CREDIT_AUTHORISATION_TERMINAL_STATUS);
  });

  it("matches the documented terminal values", () => {
    expect(LOCKED_STATUS.fact_find).toBe("Complete");
    expect(LOCKED_STATUS.needs_analysis).toBe("Complete");
    expect(LOCKED_STATUS.credit_authorisation).toBe("signed");
  });
});

describe("isLocked", () => {
  for (const { doc, terminal, draft } of CASES) {
    it(`${doc}: true only at the terminal status ("${terminal}")`, () => {
      expect(isLocked(doc, terminal)).toBe(true);
      expect(isLocked(doc, draft)).toBe(false);
      expect(isLocked(doc, "In review")).toBe(false);
      expect(isLocked(doc, "")).toBe(false);
      expect(isLocked(doc, null)).toBe(false);
      expect(isLocked(doc, undefined)).toBe(false);
    });
  }

  it("is case-sensitive (a mis-cased status is not locked)", () => {
    expect(isLocked("fact_find", "complete")).toBe(false);
    expect(isLocked("credit_authorisation", "Signed")).toBe(false);
  });
});

describe("classifyPatch", () => {
  for (const { doc, terminal, draft } of CASES) {
    describe(doc, () => {
      it("draft → draft is an update", () => {
        const d = classifyPatch(doc, draft, draft);
        expect(d).toEqual({ kind: "update", statusAfter: draft });
      });

      it("draft → terminal is a sign", () => {
        const d = classifyPatch(doc, draft, terminal);
        expect(d).toEqual({ kind: "sign", statusAfter: terminal });
      });

      it("terminal → draft is a reopen", () => {
        const d = classifyPatch(doc, terminal, draft);
        expect(d).toEqual({ kind: "reopen", statusAfter: draft });
      });

      it("terminal → terminal is rejected (a signed doc can't be edited in place)", () => {
        const d = classifyPatch(doc, terminal, terminal);
        expect(d).toEqual({ kind: "reject" });
      });
    });
  }

  it("classifies a status-preserving edit of a draft as an update, not a sign", () => {
    // A PATCH that doesn't change status passes the current status through as
    // incomingStatus — an ordinary content edit while still a draft.
    expect(classifyPatch("needs_analysis", "In review", "In review")).toEqual({
      kind: "update",
      statusAfter: "In review",
    });
  });
});
