import { describe, it, expect } from "vitest";
import {
  tallyEnrollments,
  BROADCAST_SLUG_PREFIX,
  type EnrollmentRow,
} from "./broadcast-history";

describe("BROADCAST_SLUG_PREFIX", () => {
  it("is the stable marker broadcasts are keyed off", () => {
    expect(BROADCAST_SLUG_PREFIX).toBe("broadcast-");
  });
});

describe("tallyEnrollments", () => {
  it("returns an all-zero breakdown for an empty list", () => {
    expect(tallyEnrollments([])).toEqual({
      total: 0,
      sent: 0,
      pending: 0,
      failed: 0,
      paused: 0,
      sampleFailedReasons: [],
    });
  });

  it("maps the runner's status vocabulary to labels", () => {
    const rows: EnrollmentRow[] = [
      { status: "completed" },
      { status: "completed" },
      { status: "active" },
      { status: "failed", failed_reason: "Brevo 400: hard bounce" },
      { status: "paused" },
    ];
    const b = tallyEnrollments(rows);
    expect(b.total).toBe(5);
    expect(b.sent).toBe(2);
    expect(b.pending).toBe(1);
    expect(b.failed).toBe(1);
    expect(b.paused).toBe(1);
    expect(b.sampleFailedReasons).toEqual(["Brevo 400: hard bounce"]);
  });

  it("treats null / empty / unknown status as pending", () => {
    const rows: EnrollmentRow[] = [
      { status: null },
      { status: "" },
      { status: "queued" },
    ];
    const b = tallyEnrollments(rows);
    expect(b.pending).toBe(3);
    expect(b.total).toBe(3);
  });

  it("is case-insensitive and trims status", () => {
    const b = tallyEnrollments([
      { status: " Completed " },
      { status: "FAILED", failed_reason: "x" },
    ]);
    expect(b.sent).toBe(1);
    expect(b.failed).toBe(1);
  });

  it("collects at most 3 distinct failed_reason samples", () => {
    const rows: EnrollmentRow[] = [
      { status: "failed", failed_reason: "reason A" },
      { status: "failed", failed_reason: "reason A" }, // dupe → ignored
      { status: "failed", failed_reason: "reason B" },
      { status: "failed", failed_reason: "reason C" },
      { status: "failed", failed_reason: "reason D" }, // over cap → ignored
      { status: "failed", failed_reason: null }, // no reason → skipped
    ];
    const b = tallyEnrollments(rows);
    expect(b.failed).toBe(6);
    expect(b.sampleFailedReasons).toEqual(["reason A", "reason B", "reason C"]);
  });
});
