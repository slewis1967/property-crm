import { describe, expect, it } from "vitest";
import { daysUntilDue, dueLabel, dueState, parseDue, sortTasks, taskCounts, type LiveTask } from "./tasks";

const NOW = new Date(2026, 6, 28, 9, 30); // 28 Jul 2026, 9:30am local

function task(p: Partial<LiveTask> & { id: string }): LiveTask {
  return {
    title: "t",
    body: null,
    due_date: null,
    completed: false,
    created_at: "2026-07-01T00:00:00Z",
    ...p,
  };
}

describe("parseDue", () => {
  /**
   * The table holds both shapes: date-only from the create form, full ISO from
   * Quick Log and the voice assistant. `new Date("2026-07-28")` is UTC midnight
   * — 10am AEST — so treating a date-only value as a timestamp makes a task due
   * TODAY read as overdue for the first ten hours of the day.
   */
  it("reads a date-only due as LOCAL midnight, not UTC", () => {
    const d = parseDue("2026-07-28")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(28);
    expect(d.getHours()).toBe(0);
  });

  it("passes a full timestamp through, and rejects rubbish", () => {
    expect(parseDue("2026-07-28T01:45:30.048+00:00")?.getTime()).toBe(
      Date.parse("2026-07-28T01:45:30.048+00:00"),
    );
    expect(parseDue(null)).toBeNull();
    expect(parseDue("not a date")).toBeNull();
  });
});

describe("dueState / dueLabel", () => {
  it("calls a date-only task due today 'today', not overdue", () => {
    expect(dueState("2026-07-28", NOW)).toBe("today");
    expect(dueLabel("2026-07-28", NOW)).toBe("Today");
  });

  it("compares by calendar day, so a timestamp earlier today is still today", () => {
    // 01:45 UTC on the 28th = 11:45am AEST — before `now` as a timestamp, but
    // the same calendar day, so it is not overdue.
    expect(dueState("2026-07-28T01:45:30.048+00:00", NOW)).toBe("today");
  });

  it("counts overdue in whole days", () => {
    expect(dueState("2026-07-27", NOW)).toBe("overdue");
    expect(dueLabel("2026-07-27", NOW)).toBe("1 day overdue");
    expect(dueLabel("2026-07-25", NOW)).toBe("3 days overdue");
  });

  it("labels the near future in days and the far future as a date", () => {
    expect(dueLabel("2026-07-29", NOW)).toBe("Tomorrow");
    expect(dueLabel("2026-08-02", NOW)).toBe("In 5 days");
    // Month abbreviations vary by ICU build (en-AU gives "Sept", not "Sep"),
    // so pin the shape rather than one runtime's spelling.
    expect(dueLabel("2026-09-15", NOW)).toMatch(/^15 Sept?$/);
  });

  it("adds the year only when the due date isn't this year", () => {
    expect(dueLabel("2026-09-15", NOW)).not.toMatch(/2026/);
    expect(dueLabel("2027-01-15", NOW)).toBe("15 Jan 2027");
  });

  it("has no opinion about a task with no due date", () => {
    expect(dueState(null, NOW)).toBe("none");
    expect(dueLabel(null, NOW)).toBe("");
    expect(daysUntilDue(null, NOW)).toBeNull();
  });
});

describe("sortTasks", () => {
  it("puts what needs doing first: most overdue, then soonest, undated last", () => {
    const rows = [
      task({ id: "undated" }),
      task({ id: "soon", due_date: "2026-07-29" }),
      task({ id: "very-overdue", due_date: "2026-07-01" }),
      task({ id: "overdue", due_date: "2026-07-27" }),
    ];
    expect(sortTasks(rows, NOW).map((t) => t.id)).toEqual([
      "very-overdue",
      "overdue",
      "soon",
      "undated",
    ]);
  });

  it("sinks completed tasks below every open one, including undated", () => {
    const rows = [
      task({ id: "done", completed: true, due_date: "2026-07-01" }),
      task({ id: "undated" }),
    ];
    expect(sortTasks(rows, NOW).map((t) => t.id)).toEqual(["undated", "done"]);
  });

  it("breaks ties on newest first, and doesn't mutate the input", () => {
    const rows = [
      task({ id: "older", created_at: "2026-07-01T00:00:00Z" }),
      task({ id: "newer", created_at: "2026-07-20T00:00:00Z" }),
    ];
    const before = rows.map((t) => t.id);
    expect(sortTasks(rows, NOW).map((t) => t.id)).toEqual(["newer", "older"]);
    expect(rows.map((t) => t.id)).toEqual(before);
  });
});

describe("taskCounts", () => {
  it("counts open, overdue and completed", () => {
    const rows = [
      task({ id: "a", due_date: "2026-07-01" }),
      task({ id: "b", due_date: "2026-08-01" }),
      task({ id: "c" }),
      task({ id: "d", completed: true, due_date: "2026-07-01" }),
    ];
    // The completed one is overdue by date but must not be counted as overdue.
    expect(taskCounts(rows, NOW)).toEqual({ open: 3, overdue: 1, completed: 1, all: 4 });
  });
});
