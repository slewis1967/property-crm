import { describe, expect, it } from "vitest";
import { HELP_SECTIONS, searchGuides, sectionForPath } from "./index";

describe("help guides", () => {
  const guides = HELP_SECTIONS.flatMap((s) => s.guides);

  it("gives every guide a unique kebab-case id", () => {
    const ids = guides.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("gives every guide a title, a summary and at least two steps", () => {
    for (const g of guides) {
      expect(g.title.trim(), g.id).not.toBe("");
      expect(g.summary.trim(), g.id).not.toBe("");
      expect(g.steps.length, g.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("never lets two sections claim the same path", () => {
    const paths = HELP_SECTIONS.flatMap((s) => s.paths);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("sectionForPath", () => {
  const label = (p: string) => sectionForPath(HELP_SECTIONS, p)?.label;

  it("matches the home page only exactly", () => {
    expect(label("/")).toBe("War Room");
    expect(label("/no-such-page")).toBeUndefined();
  });

  it("covers a section's detail pages", () => {
    expect(label("/contacts/abc-123")).toBe("Contacts");
  });

  it("prefers the most specific section", () => {
    expect(label("/tasks")).toBe("Tasks");
    expect(label("/tasks/archive")).not.toBe("Tasks");
    expect(label("/lenders/match")).toBe("Lender Match");
    expect(label("/lenders/some-id")).toBe("Lender Policy");
    expect(label("/aml/reports")).toBe("AUSTRAC Reports");
  });

  it("does not treat a longer word as a sub-page", () => {
    expect(label("/contactsheet")).toBeUndefined();
  });
});

describe("searchGuides", () => {
  it("needs every word to match", () => {
    expect(searchGuides(HELP_SECTIONS, "add contact").length).toBeGreaterThan(0);
    expect(searchGuides(HELP_SECTIONS, "add zzzqqq")).toEqual([]);
    expect(searchGuides(HELP_SECTIONS, "   ")).toEqual([]);
  });
});
