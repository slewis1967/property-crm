import { describe, it, expect } from "vitest";
import { issueMatchesDocument, remainingIssues, type VerificationIssue } from "./yla-overrides";

const issue = (over: Partial<VerificationIssue>): VerificationIssue => ({
  filename: "Photo ID 2 Back - Libman (NK-10017).pdf",
  applicant: "Applicant 2",
  name: "Marcia Libman",
  issues: ["not clearly legible", "rotated / not upright"],
  ...over,
});

describe("issueMatchesDocument", () => {
  it("matches the file it was written about", () => {
    expect(
      issueMatchesDocument(issue({}), {
        filename: "Photo ID 2 Back - Libman (NK-10017).pdf",
        applicantName: "Marcia Libman",
      }),
    ).toBe(true);
  });

  // The reason this function takes a name at all: joint applicants who share a
  // surname share every filename, so one dismissal must not clear the other's
  // file — a licence nobody has looked at would go to YLA as checked.
  it("does not match a co-applicant's identically named file", () => {
    expect(
      issueMatchesDocument(issue({}), {
        filename: "Photo ID 2 Back - Libman (NK-10017).pdf",
        applicantName: "Mark Benjamin Libman",
      }),
    ).toBe(false);
  });

  it("matches on filename alone for a legacy issue that names nobody", () => {
    expect(
      issueMatchesDocument(issue({ name: null }), {
        filename: "Photo ID 2 Back - Libman (NK-10017).pdf",
        applicantName: "Mark Benjamin Libman",
      }),
    ).toBe(true);
  });

  // An unsigned Needs Analysis is ours to produce, not ours to wave through.
  it("never matches an application-level blocker", () => {
    expect(
      issueMatchesDocument(issue({ filename: null, name: null }), {
        filename: "Photo ID 2 Back - Libman (NK-10017).pdf",
        applicantName: "Marcia Libman",
      }),
    ).toBe(false);
  });
});

describe("remainingIssues", () => {
  const ato = issue({
    filename: "ATO Income Statement 5 - Libman (NK-10017).pdf",
    applicant: "Applicant 1",
    name: "Mark Benjamin Libman",
    issues: ["appears to be a superannuation fund statement"],
  });

  it("holds the application while any objection stands", () => {
    const left = remainingIssues([ato, issue({})], [
      { filename: ato.filename!, applicantName: "Mark Benjamin Libman" },
    ]);
    expect(left).toHaveLength(1);
    expect(left[0]!.name).toBe("Marcia Libman");
  });

  it("clears once every objection is answered", () => {
    expect(
      remainingIssues([ato, issue({})], [
        { filename: ato.filename!, applicantName: "Mark Benjamin Libman" },
        { filename: issue({}).filename!, applicantName: "Marcia Libman" },
      ]),
    ).toEqual([]);
  });

  it("treats no recorded verdict as nothing outstanding", () => {
    expect(remainingIssues(null, [])).toEqual([]);
  });

  it("leaves an application-level blocker standing even when every file is dismissed", () => {
    const left = remainingIssues([ato, issue({ filename: null, name: null, issues: ["Needs Analysis not signed"] })], [
      { filename: ato.filename!, applicantName: "Mark Benjamin Libman" },
    ]);
    expect(left).toHaveLength(1);
    expect(left[0]!.issues).toEqual(["Needs Analysis not signed"]);
  });
});
