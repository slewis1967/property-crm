import { describe, it, expect } from "vitest";
import { REQUEST_SELECT } from "./income-reconciliation-run";

/**
 * Every column the reconciliation READS must be in the column list it SELECTS.
 *
 * This looks like a tautology and is not. Omitting a column from a PostgREST
 * select is not an error: the field arrives undefined, whatever default sits
 * behind it looks plausible, and nothing is logged. That is exactly how
 * `signature_requests.brand` shipped stored-but-never-read — the row said
 * "springboard" while the page said NextKey.
 *
 * Here the equivalent slip would be silent too: `needs_analysis_id` missing
 * would send the resolution back to looking a Needs Analysis up by contact,
 * which usually returns the right one, so the check would keep working and
 * quietly stop being precise.
 */
describe("the document-request select", () => {
  const columns = REQUEST_SELECT.split(",").map((c) => c.trim());

  it("carries the three ways a declared position is resolved", () => {
    expect(columns).toContain("needs_analysis_id");
    expect(columns).toContain("contact_id");
    expect(columns).toContain("fact_find_id");
  });

  it("carries what the sibling-gathering and reporting need", () => {
    for (const c of ["id", "application_id", "applicant_name", "status", "client_ref"]) {
      expect(columns).toContain(c);
    }
  });

  it("selects no duplicates and nothing blank", () => {
    expect(new Set(columns).size).toBe(columns.length);
    expect(columns.every((c) => c.length > 0)).toBe(true);
  });
});
