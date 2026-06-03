import { describe, it, expect } from "vitest";
import {
  ALLOWED_PAGE_SIZES,
  DEFAULT_PAGE_SIZE,
  coercePageSize,
  coercePage,
  paginate,
  type PageSize,
} from "./pagination";

/**
 * The pagination contract that both /api/properties/list and
 * /api/contacts/list rely on. The shape of the response is what
 * the client grid uses to know "X of Y loaded, more available".
 */
describe("ALLOWED_PAGE_SIZES", () => {
  it("contains exactly 25, 50, 75, 100", () => {
    expect(ALLOWED_PAGE_SIZES).toEqual([25, 50, 75, 100]);
  });
});

describe("coercePageSize", () => {
  it("accepts a known page size as a number", () => {
    expect(coercePageSize(25)).toBe(25);
    expect(coercePageSize(50)).toBe(50);
    expect(coercePageSize(75)).toBe(75);
    expect(coercePageSize(100)).toBe(100);
  });

  it("accepts a known page size as a string", () => {
    expect(coercePageSize("25")).toBe(25);
    expect(coercePageSize("100")).toBe(100);
  });

  it("falls back to DEFAULT_PAGE_SIZE for unknown values", () => {
    expect(coercePageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(coercePageSize(999)).toBe(DEFAULT_PAGE_SIZE);
    expect(coercePageSize("not-a-number")).toBe(DEFAULT_PAGE_SIZE);
    expect(coercePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(coercePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("rejects page sizes off by one from a known value", () => {
    // Important — the URL is user-controlled. 26 shouldn't silently
    // pass through as "50".
    expect(coercePageSize(26)).toBe(DEFAULT_PAGE_SIZE);
    expect(coercePageSize(101)).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("coercePage", () => {
  it("accepts positive integer strings", () => {
    expect(coercePage("1")).toBe(1);
    expect(coercePage("5")).toBe(5);
    expect(coercePage("999")).toBe(999);
  });

  it("floors fractional values", () => {
    expect(coercePage("2.7")).toBe(2);
    expect(coercePage("3.99")).toBe(3);
  });

  it("clamps to 1 for zero / negative / non-numeric", () => {
    expect(coercePage("0")).toBe(1);
    expect(coercePage("-3")).toBe(1);
    expect(coercePage("abc")).toBe(1);
    expect(coercePage(null)).toBe(1);
    expect(coercePage(undefined)).toBe(1);
  });
});

describe("paginate", () => {
  it("returns hasMore=true when there are more pages", () => {
    const result = paginate([1, 2, 3], 1, 25 as PageSize, 100);
    expect(result.hasMore).toBe(true);
    expect(result.total).toBe(100);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(25);
  });

  it("returns hasMore=false on the last page", () => {
    const result = paginate([1, 2, 3], 4, 25 as PageSize, 100);
    expect(result.hasMore).toBe(false);
  });

  it("returns hasMore=false when rows fit exactly in one page", () => {
    // 50 rows, pageSize 50, page 1 → all rows fit, nothing more
    const result = paginate(new Array(50).fill(0), 1, 50 as PageSize, 50);
    expect(result.hasMore).toBe(false);
  });

  it("returns hasMore=true for partial last page", () => {
    // 51 rows total, page 2 of 25 → 25 more rows on page 2, page 3
    // would have 1 row left, so hasMore is true even though page 2
    // returned a full page.
    const result = paginate(new Array(25).fill(0), 2, 25 as PageSize, 51);
    expect(result.hasMore).toBe(true);
  });

  it("handles total=0", () => {
    const result = paginate([], 1, 50 as PageSize, 0);
    expect(result.hasMore).toBe(false);
    expect(result.total).toBe(0);
    expect(result.rows).toEqual([]);
  });
});
