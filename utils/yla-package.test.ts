import { describe, it, expect } from "vitest";
import { packageFilename, ylaFilename } from "./yla-documents";

describe("packageFilename", () => {
  it("matches the shape of the client-uploaded filenames it sits beside", () => {
    // These land in the same Drive folder as the portal's files, and YLA's
    // standard is "named to reflect the document" — the two must not diverge.
    expect(packageFilename("Needs Analysis", "David Halliday", "NK-10010")).toBe(
      "Needs Analysis - Halliday (NK-10010).pdf",
    );
    expect(ylaFilename("super_statement", 1, "Halliday", "NK-10010")).toBe(
      "Super Statement - Halliday (NK-10010).pdf",
    );
  });
  it("uses the surname, not the full name", () => {
    expect(packageFilename("Credit Authorisation", "Melissa May-Anne Halliday", "NK-10010")).toBe(
      "Credit Authorisation - Halliday (NK-10010).pdf",
    );
  });
  it("degrades cleanly when the name or reference is missing", () => {
    expect(packageFilename("Needs Analysis", null, null)).toBe("Needs Analysis.pdf");
    expect(packageFilename("Needs Analysis", "Halliday", null)).toBe("Needs Analysis - Halliday.pdf");
    expect(packageFilename("Needs Analysis", null, "NK-10010")).toBe("Needs Analysis (NK-10010).pdf");
  });
  it("strips characters that would break a Drive filename", () => {
    expect(packageFilename("Needs Analysis", "David O'Hall/iday", "NK-10010")).toBe(
      "Needs Analysis - OHalliday (NK-10010).pdf",
    );
  });
});
