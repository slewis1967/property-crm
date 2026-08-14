import { describe, it, expect } from "vitest";
import {
  isAcknowledged,
  sizeLabel,
  toResourceView,
  shelve,
  unacknowledged,
  isResourceCategory,
  type ResourceRow,
} from "./introducer-resources";

const row = (over: Partial<ResourceRow> = {}): ResourceRow => ({
  id: "r1",
  slug: "policy-manual",
  title: "Introducer Policy Manual",
  description: "What you may and may not say.",
  category: "manual",
  filename: "manual.pdf",
  mime_type: "application/pdf",
  size_bytes: 1_500_000,
  version: "1.0",
  requires_ack: true,
  sort_order: 10,
  updated_at: "2026-08-14T00:00:00Z",
  ...over,
});

describe("isAcknowledged", () => {
  it("matches an acknowledgement of the same version", () => {
    expect(isAcknowledged(row(), [{ resource_id: "r1", version: "1.0" }])).toBe(true);
  });

  it("ignores an acknowledgement of a different document", () => {
    expect(isAcknowledged(row(), [{ resource_id: "r2", version: "1.0" }])).toBe(false);
  });

  /**
   * The invariant the whole feature turns on. Publishing a revised manual must
   * put everyone back into the "has not read this" column, because the thing
   * they confirmed reading is not the thing that now governs them.
   */
  it("a revision voids the acknowledgement of the version it replaced", () => {
    const acks = [{ resource_id: "r1", version: "1.0" }];
    expect(isAcknowledged(row({ version: "1.1" }), acks)).toBe(false);
  });

  it("does not treat a later acknowledgement as covering an earlier version", () => {
    // "2.0 read" is not evidence that 1.0 was read. Version strings are
    // compared, never ordered — inferring coverage would invent consent.
    const acks = [{ resource_id: "r1", version: "2.0" }];
    expect(isAcknowledged(row({ version: "1.0" }), acks)).toBe(false);
  });

  it("tolerates whitespace and case in the version string", () => {
    expect(isAcknowledged(row({ version: "Aug 2026" }), [
      { resource_id: "r1", version: " aug 2026 " },
    ])).toBe(true);
  });
});

describe("sizeLabel", () => {
  it("scales through the units", () => {
    expect(sizeLabel(900)).toBe("900 B");
    expect(sizeLabel(205_000)).toBe("200 KB");
    expect(sizeLabel(1_572_864)).toBe("1.5 MB");
  });

  it("returns null rather than a confident zero when the size is unknown", () => {
    expect(sizeLabel(null)).toBeNull();
    expect(sizeLabel(0)).toBeNull();
    expect(sizeLabel(undefined)).toBeNull();
    expect(sizeLabel("not a number")).toBeNull();
  });

  it("reads a numeric string, because bigint arrives as one", () => {
    expect(sizeLabel("205000")).toBe("200 KB");
  });
});

describe("toResourceView", () => {
  it("never exposes a storage path", () => {
    const view = toResourceView(row(), []) as Record<string, unknown>;
    expect(Object.keys(view)).not.toContain("storage_path");
    expect(Object.keys(view)).not.toContain("slug");
  });

  it("files an unrecognised category under Reference rather than dropping it", () => {
    // A document on the shelf but rendered in no section is invisible, which is
    // a worse failure than being under the wrong heading.
    expect(toResourceView(row({ category: "whatever" }), []).category).toBe("reference");
  });

  it("carries the acknowledgement state through", () => {
    expect(toResourceView(row(), [{ resource_id: "r1", version: "1.0" }]).acknowledged).toBe(true);
    expect(toResourceView(row(), []).acknowledged).toBe(false);
  });
});

describe("shelve", () => {
  const views = [
    toResourceView(row({ id: "a", category: "marketing" }), []),
    toResourceView(row({ id: "b", category: "manual" }), []),
    toResourceView(row({ id: "c", category: "manual" }), []),
  ];

  it("puts manuals first, whatever order the rows arrived in", () => {
    expect(shelve(views).map((s) => s.category)).toEqual(["manual", "marketing"]);
  });

  it("drops empty sections", () => {
    expect(shelve(views).map((s) => s.category)).not.toContain("agreement");
  });

  it("preserves the query's ordering inside a section", () => {
    expect(shelve(views)[0].items.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("returns nothing for an empty shelf", () => {
    expect(shelve([])).toEqual([]);
  });
});

describe("unacknowledged", () => {
  it("counts only documents that ask to be confirmed", () => {
    const list = [
      toResourceView(row({ id: "needs", requires_ack: true }), []),
      toResourceView(row({ id: "done", requires_ack: true }), [
        { resource_id: "done", version: "1.0" },
      ]),
      toResourceView(row({ id: "optional", requires_ack: false }), []),
    ];
    expect(unacknowledged(list).map((v) => v.id)).toEqual(["needs"]);
  });
});

describe("isResourceCategory", () => {
  it("accepts the four known categories and nothing else", () => {
    expect(isResourceCategory("manual")).toBe(true);
    expect(isResourceCategory("Marketing")).toBe(false);
    expect(isResourceCategory(null)).toBe(false);
  });
});
