import { describe, it, expect } from "vitest";
import {
  sharedFolderTableMissing,
  sanitiseName,
  safeStorageName,
  splitExtension,
  uniqueName,
  buildBreadcrumbs,
  hasTrashedAncestor,
  collectSubtreeIds,
  indexById,
  fmtBytes,
  iconFor,
  MAX_NAME_LENGTH,
  type TreeNode,
} from "./shared-folder";

describe("sharedFolderTableMissing", () => {
  it("is true for a missing table", () => {
    expect(sharedFolderTableMissing({ code: "42P01" })).toBe(true);
    expect(sharedFolderTableMissing({ code: "PGRST205" })).toBe(true);
    expect(sharedFolderTableMissing({ message: "Could not find the table 'x'" })).toBe(true);
    expect(sharedFolderTableMissing({ message: 'relation "shared_folder_items" does not exist' })).toBe(true);
  });

  it("is false for a missing COLUMN — that is a schema mismatch, not an unrun migration", () => {
    expect(sharedFolderTableMissing({ code: "42703" })).toBe(false);
    expect(sharedFolderTableMissing({ code: "PGRST204" })).toBe(false);
  });

  it("is false for null and for unrelated errors", () => {
    expect(sharedFolderTableMissing(null)).toBe(false);
    expect(sharedFolderTableMissing({ code: "23505", message: "duplicate key" })).toBe(false);
  });
});

describe("sanitiseName", () => {
  it("keeps ordinary names", () => {
    expect(sanitiseName("Q3 Board Pack.pdf")).toBe("Q3 Board Pack.pdf");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitiseName("  spaced   out  ")).toBe("spaced out");
  });

  it("turns path separators into dashes so a name can't fake a folder boundary", () => {
    expect(sanitiseName("a/b")).toBe("a-b");
    expect(sanitiseName("a\\b")).toBe("a-b");
  });

  it("strips control characters", () => {
    expect(sanitiseName("we" + String.fromCharCode(7) + "irdname")).toBe("weirdname");
  });

  it("rejects empty, whitespace-only, traversal names and non-strings", () => {
    expect(sanitiseName("")).toBeNull();
    expect(sanitiseName("   ")).toBeNull();
    expect(sanitiseName(".")).toBeNull();
    expect(sanitiseName("..")).toBeNull();
    expect(sanitiseName(42)).toBeNull();
    expect(sanitiseName(null)).toBeNull();
  });

  it("rejects names over the length cap", () => {
    expect(sanitiseName("a".repeat(MAX_NAME_LENGTH))).toHaveLength(MAX_NAME_LENGTH);
    expect(sanitiseName("a".repeat(MAX_NAME_LENGTH + 1))).toBeNull();
  });
});

describe("safeStorageName", () => {
  it("replaces unsafe runs with a single underscore", () => {
    expect(safeStorageName("My File (final).pdf")).toBe("My_File_final_.pdf");
  });

  it("never returns an empty string", () => {
    expect(safeStorageName("///")).toBe("file");
    expect(safeStorageName("...")).toBe("file");
  });

  it("caps the length so the storage path stays sane", () => {
    expect(safeStorageName("x".repeat(200)).length).toBe(80);
  });
});

describe("splitExtension", () => {
  it("splits on the LAST dot", () => {
    expect(splitExtension("report.final.pdf")).toEqual({ base: "report.final", ext: ".pdf" });
  });

  it("treats a dotfile and a trailing dot as having no extension", () => {
    expect(splitExtension(".gitignore")).toEqual({ base: ".gitignore", ext: "" });
    expect(splitExtension("name.")).toEqual({ base: "name.", ext: "" });
    expect(splitExtension("noext")).toEqual({ base: "noext", ext: "" });
  });
});

describe("uniqueName", () => {
  it("passes an unused name straight through", () => {
    expect(uniqueName("a.pdf", ["b.pdf"])).toBe("a.pdf");
  });

  it("suffixes before the extension, not after", () => {
    expect(uniqueName("a.pdf", ["a.pdf"])).toBe("a (2).pdf");
    expect(uniqueName("a.pdf", ["a.pdf", "a (2).pdf"])).toBe("a (3).pdf");
  });

  it("compares case-insensitively — a file list reads that way", () => {
    expect(uniqueName("A.PDF", ["a.pdf"])).toBe("A (2).PDF");
  });

  it("handles extensionless names", () => {
    expect(uniqueName("Reports", ["Reports"])).toBe("Reports (2)");
  });
});

describe("buildBreadcrumbs", () => {
  const folders: TreeNode[] = [
    { id: "a", parent_id: null, name: "Marketing" },
    { id: "b", parent_id: "a", name: "2026" },
    { id: "c", parent_id: "b", name: "Q3" },
  ];

  it("returns the root as an empty trail", () => {
    expect(buildBreadcrumbs(folders, null)).toEqual([]);
  });

  it("walks from the root down to the target", () => {
    expect(buildBreadcrumbs(folders, "c")).toEqual([
      { id: "a", name: "Marketing" },
      { id: "b", name: "2026" },
      { id: "c", name: "Q3" },
    ]);
  });

  it("terminates on a cycle instead of hanging", () => {
    const cyclic: TreeNode[] = [
      { id: "x", parent_id: "y", name: "X" },
      { id: "y", parent_id: "x", name: "Y" },
    ];
    expect(buildBreadcrumbs(cyclic, "x")).toHaveLength(2);
  });
});

describe("hasTrashedAncestor", () => {
  const nodes: TreeNode[] = [
    { id: "root", parent_id: null, deleted_at: null },
    { id: "trashed", parent_id: null, deleted_at: "2026-08-13T00:00:00Z" },
    { id: "kid", parent_id: "trashed", deleted_at: null },
    { id: "grandkid", parent_id: "kid", deleted_at: null },
    { id: "clean", parent_id: "root", deleted_at: null },
    { id: "orphan", parent_id: "gone", deleted_at: null },
  ];
  const byId = indexById(nodes);

  it("is false for items in a live tree", () => {
    expect(hasTrashedAncestor(byId.get("clean")!, byId)).toBe(false);
    expect(hasTrashedAncestor(byId.get("root")!, byId)).toBe(false);
  });

  it("is true at any depth beneath a trashed folder", () => {
    expect(hasTrashedAncestor(byId.get("kid")!, byId)).toBe(true);
    expect(hasTrashedAncestor(byId.get("grandkid")!, byId)).toBe(true);
  });

  it("treats a missing parent as unreachable", () => {
    expect(hasTrashedAncestor(byId.get("orphan")!, byId)).toBe(true);
  });
});

describe("collectSubtreeIds", () => {
  const nodes: TreeNode[] = [
    { id: "a", parent_id: null },
    { id: "b", parent_id: "a" },
    { id: "c", parent_id: "a" },
    { id: "d", parent_id: "b" },
    { id: "other", parent_id: null },
  ];

  it("includes the root itself and every descendant", () => {
    expect(collectSubtreeIds("a", nodes).sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("excludes unrelated branches", () => {
    expect(collectSubtreeIds("b", nodes).sort()).toEqual(["b", "d"]);
    expect(collectSubtreeIds("other", nodes)).toEqual(["other"]);
  });

  it("survives a cycle", () => {
    const cyclic: TreeNode[] = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    expect(collectSubtreeIds("x", cyclic).sort()).toEqual(["x", "y"]);
  });
});

describe("fmtBytes", () => {
  it("formats across units", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(1024 * 1024)).toBe("1.0 MB");
    expect(fmtBytes(15 * 1024 * 1024)).toBe("15 MB");
  });

  it("returns an em dash for folders and bad values", () => {
    expect(fmtBytes(null)).toBe("—");
    expect(fmtBytes(undefined)).toBe("—");
    expect(fmtBytes(-1)).toBe("—");
    expect(fmtBytes(Number.NaN)).toBe("—");
  });
});

describe("iconFor", () => {
  it("distinguishes folders from files", () => {
    expect(iconFor({ kind: "folder", name: "anything.pdf" })).toBe("📁");
    expect(iconFor({ kind: "file", name: "a.pdf" })).toBe("📕");
  });

  it("is case-insensitive on the extension and falls back for unknowns", () => {
    expect(iconFor({ kind: "file", name: "SHOT.PNG" })).toBe("🖼️");
    expect(iconFor({ kind: "file", name: "thing.xyz" })).toBe("📎");
  });
});
