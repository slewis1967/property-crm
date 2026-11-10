import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv, type CsvColumn } from "./csv";

describe("escapeCsvField", () => {
  it("passes plain values through untouched", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField("no special chars")).toBe("no special chars");
    expect(escapeCsvField(42)).toBe("42");
    expect(escapeCsvField(0)).toBe("0");
    expect(escapeCsvField(true)).toBe("true");
  });

  it("renders null and undefined as an empty field", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("does NOT treat an empty string or zero specially", () => {
    expect(escapeCsvField("")).toBe("");
    expect(escapeCsvField(0)).toBe("0");
  });

  it("quotes fields containing a comma", () => {
    expect(escapeCsvField("Smith, John")).toBe('"Smith, John"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(escapeCsvField('She said "hi"')).toBe('"She said ""hi"""');
  });

  it("quotes fields containing newlines and carriage returns", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvField("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("quotes a field that is only a double quote", () => {
    expect(escapeCsvField('"')).toBe('""""');
  });
});

describe("toCsv", () => {
  interface Row {
    name: string | null;
    email: string | null;
    tags: string[] | null;
    score: number | null;
  }

  const columns: CsvColumn<Row>[] = [
    { header: "Name", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Tags", value: (r) => (r.tags || []).join("; ") },
    { header: "Score", value: (r) => r.score },
  ];

  it("emits a header row followed by CRLF-separated data rows", () => {
    const rows: Row[] = [
      { name: "Alice", email: "alice@example.com", tags: ["hot", "fhb"], score: 90 },
      { name: "Bob", email: "bob@example.com", tags: [], score: null },
    ];
    expect(toCsv(rows, columns)).toBe(
      "Name,Email,Tags,Score\r\n" +
        "Alice,alice@example.com,hot; fhb,90\r\n" +
        "Bob,bob@example.com,,"
    );
  });

  it("emits only the header row when there are no data rows", () => {
    expect(toCsv([], columns)).toBe("Name,Email,Tags,Score");
  });

  it("escapes fields with commas, quotes, and newlines within a full row", () => {
    const rows: Row[] = [
      { name: 'Smith, "Jr"', email: "x@y.com", tags: ["a\nb"], score: 1 },
    ];
    expect(toCsv(rows, columns)).toBe(
      'Name,Email,Tags,Score\r\n' + '"Smith, ""Jr""",x@y.com,"a\nb",1'
    );
  });

  it("renders null / undefined cells as empty fields", () => {
    const rows: Row[] = [{ name: null, email: null, tags: null, score: null }];
    expect(toCsv(rows, columns)).toBe("Name,Email,Tags,Score\r\n,,,");
  });
});
