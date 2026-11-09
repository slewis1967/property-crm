import { describe, it, expect } from "vitest";
import { fetchAllRows, fetchRowWindow } from "./supabase-paginate";

/**
 * A fake PostgREST: rows 0..total-1, and — like the real one — never more
 * than 1,000 rows in one response, whatever range was asked for. That cap is
 * what froze the Aggregator Feed at 1,000 rows on 2026-09-15.
 */
function fakeTable(total: number, cap = 1000) {
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    if (to < from) return { data: null, error: { message: `invalid range ${from}-${to}` } };
    const last = Math.min(to, from + cap - 1, total - 1);
    const data: number[] = [];
    for (let i = from; i <= last; i++) data.push(i);
    return { data, error: null };
  };
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("reads past the 1,000-row response cap", async () => {
    const t = fakeTable(1186);
    const { data, error } = await fetchAllRows(t.page);
    expect(error).toBeNull();
    expect(data).toHaveLength(1186);
    expect(data[1185]).toBe(1185);
  });

  it("stops on a short batch", async () => {
    const t = fakeTable(250);
    const { data } = await fetchAllRows(t.page);
    expect(data).toHaveLength(250);
    expect(t.calls).toHaveLength(1);
  });

  it("passes an error through with what it had so far", async () => {
    let n = 0;
    const { data, error } = await fetchAllRows(async (from, to) => {
      n++;
      if (n === 2) return { data: null, error: { message: "boom" } };
      return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null };
    });
    expect(error).toBe("boom");
    expect(data).toHaveLength(1000);
  });
});

describe("fetchRowWindow", () => {
  it("returns a window larger than 1,000 rows (the feed's 'All' option)", async () => {
    const t = fakeTable(1186);
    const { data, error } = await fetchRowWindow(t.page, 0, 1186);
    expect(error).toBeNull();
    expect(data).toHaveLength(1186);
  });

  it("handles a window of exactly 1,000 without requesting a reversed range", async () => {
    const t = fakeTable(5000);
    const { data, error } = await fetchRowWindow(t.page, 0, 1000);
    expect(error).toBeNull();
    expect(data).toHaveLength(1000);
    expect(t.calls).toEqual([[0, 999]]);
  });

  it("starts mid-table and never reads past the window", async () => {
    const t = fakeTable(5000);
    const { data } = await fetchRowWindow(t.page, 1500, 1200);
    expect(data[0]).toBe(1500);
    expect(data[data.length - 1]).toBe(2699);
    expect(data).toHaveLength(1200);
    expect(t.calls.every(([a, b]) => b >= a && b <= 2699)).toBe(true);
  });

  it("stops when the table ends inside the window", async () => {
    const t = fakeTable(1186);
    const { data } = await fetchRowWindow(t.page, 1000, 500);
    expect(data).toHaveLength(186);
  });

  it("does nothing for an empty window", async () => {
    const t = fakeTable(100);
    const { data } = await fetchRowWindow(t.page, 0, 0);
    expect(data).toEqual([]);
    expect(t.calls).toEqual([]);
  });
});
