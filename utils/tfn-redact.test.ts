import { describe, it, expect } from "vitest";
import { isTfn, findTfns, parseToUnicode, redactTfns } from "./tfn-redact";

describe("isTfn", () => {
  // Marcia Libman's, the one that started this. Checksum-valid.
  it("accepts a real TFN", () => {
    expect(isTfn("342491216")).toBe(true);
  });

  it("rejects a number that fails the checksum", () => {
    expect(isTfn("342491217")).toBe(false);
    expect(isTfn("123456789")).toBe(false);
  });

  it("rejects anything that is not nine digits", () => {
    expect(isTfn("34249121")).toBe(false);
    expect(isTfn("3424912160")).toBe(false);
    expect(isTfn("48309517921")).toBe(false); // Mark Libman's ABN — 11 digits
    expect(isTfn("")).toBe(false);
  });
});

describe("findTfns", () => {
  it("finds one spaced the way myGov prints it", () => {
    const hits = findTfns("NameMARCIA LIBMANTFN342 491 216DEPARTMENT");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.digits).toBe("342491216");
    // The run it will blank covers the spaces too, or they would be left behind.
    expect(hits[0]!.length).toBe("342 491 216".length);
  });

  it("finds one printed without spaces", () => {
    expect(findTfns("TFN 342491216")[0]!.digits).toBe("342491216");
  });

  // These all appear on the documents being redacted and must survive.
  it("leaves the other numbers on the page alone", () => {
    const page = [
      "Employee number 08861861000",
      "Employer ABN/Branch 52 705 101 522 / 001",
      "Member account number 94382453",
      "Gross amount $79,505.27",
      "Period 01/07/2024 - 22/06/2025",
    ].join(" ");
    expect(findTfns(page)).toEqual([]);
  });

  it("finds nothing in an empty page", () => {
    expect(findTfns("")).toEqual([]);
  });
});

describe("parseToUnicode", () => {
  it("reads the bfchar form Skia emits", () => {
    const map = parseToUnicode("5 beginbfchar\n<05> <0020>\n<2E> <0049>\n<48> <0063>\nendbfchar");
    expect(map.get(0x05)).toBe(" ");
    expect(map.get(0x2e)).toBe("I");
    expect(map.get(0x48)).toBe("c");
  });

  it("expands a bfrange", () => {
    const map = parseToUnicode("1 beginbfrange\n<10> <12> <0041>\nendbfrange");
    expect(map.get(0x10)).toBe("A");
    expect(map.get(0x11)).toBe("B");
    expect(map.get(0x12)).toBe("C");
  });

  it("refuses a malformed range rather than looping", () => {
    expect(parseToUnicode("1 beginbfrange\n<12> <10> <0041>\nendbfrange").size).toBe(0);
  });
});

describe("redactTfns", () => {
  it("reports a non-PDF as unreadable instead of throwing", async () => {
    const r = await redactTfns(new TextEncoder().encode("this is not a pdf"));
    expect(r.unreadable).toBe(true);
    expect(r.removed).toBe(0);
  });

  // The honest contract: 0 removed does NOT mean the document is safe. A
  // photographed statement has no text layer to search, and the caller must
  // keep such a document gated rather than reading this as a clean bill.
  it("returns the original bytes untouched when it finds nothing", async () => {
    const bytes = new TextEncoder().encode("not a pdf either");
    const r = await redactTfns(bytes);
    expect(r.bytes).toBe(bytes);
    expect(r.removed).toBe(0);
  });
});
