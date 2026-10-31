import { describe, expect, it } from "vitest";
import { REPORT_SCHEMA } from "./feasibility-report-schema";

type Node = { properties: Record<string, Node>; items: Node; minItems?: number };

describe("REPORT_SCHEMA", () => {
  const root = REPORT_SCHEMA as unknown as Node;

  it("can't describe a report with nothing in it", () => {
    const sections = root.properties.sections!;
    expect(sections.minItems).toBe(1);
    expect(sections.items.properties.blocks!.minItems).toBe(1);
  });

  it("covers every top-level field the report renders", () => {
    expect(Object.keys(root.properties)).toEqual([
      "title",
      "subtitle",
      "meta",
      "keyStats",
      "sections",
      "disclaimer",
    ]);
  });
});
