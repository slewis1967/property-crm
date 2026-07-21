import { describe, it, expect } from "vitest";
import {
  sydneyParts,
  computeProgress,
  computeDueReminder,
  deadlineLine,
  renderReminder,
  type ReminderReq,
} from "./document-reminders";

// July = AEST (UTC+10, no DST). Sydney wall-clock = UTC + 10h.
//   Wed 2026-07-22 10:00 Sydney  == 2026-07-22T00:00:00Z
//   Thu 2026-07-23 10:00 Sydney  == 2026-07-23T00:00:00Z
const WED_10AM = new Date("2026-07-22T00:00:00Z");
const THU_10AM = new Date("2026-07-23T00:00:00Z");
const THU_6AM = new Date("2026-07-22T20:00:00Z"); // Sydney Thu 06:00 (before window)

const openReq = (over: Partial<ReminderReq> = {}): ReminderReq => ({
  status: "open",
  created_at: "2026-07-20T00:00:00Z", // 2 days before THU_10AM
  expires_at: null,
  reminder_count: 0,
  last_reminder_at: null,
  reminders_opted_out: false,
  ...over,
});

const empty = { received: 0, total: 7 };

describe("sydneyParts", () => {
  it("resolves weekday + hour in Australia/Sydney (AEST)", () => {
    const p = sydneyParts(WED_10AM);
    expect(p.weekday).toBe(3); // Wed
    expect(p.hour).toBe(10);
    expect(p.ymd).toBe("2026-07-22");
  });
});

describe("computeProgress", () => {
  it("counts per doc type, caps at required, and flags outstanding (incl. ato_income for myGov)", () => {
    const p = computeProgress([
      { doc_type: "payslip", status: "uploaded" },
      { doc_type: "payslip", status: "uploaded" },
      { doc_type: "photo_id", status: "uploaded" },
      { doc_type: "payslip", status: "replaced" }, // ignored
    ]);
    expect(p.received).toBe(3); // 2 payslips + 1 photo id
    expect(p.total).toBe(7);
    expect(p.outstandingKeys).toContain("ato_income");
    expect(p.outstandingKeys).toContain("super_statement");
    expect(p.outstandingKeys).not.toContain("payslip");
  });
});

describe("computeDueReminder", () => {
  it("returns nudge1 (email only) at day 1 with no prior reminders", () => {
    const due = computeDueReminder(openReq(), empty, THU_10AM);
    expect(due).toEqual({ kind: "nudge1", channels: ["email"] });
  });

  it("returns nudge2 (email+sms) once one drip has gone and age >= 3", () => {
    const due = computeDueReminder(
      openReq({ reminder_count: 1, created_at: "2026-07-19T00:00:00Z" }),
      empty,
      THU_10AM,
    );
    expect(due).toEqual({ kind: "nudge2", channels: ["email", "sms"] });
  });

  it("fires the cutoff push on Wednesday for a request issued earlier", () => {
    const due = computeDueReminder(openReq({ reminder_count: 1 }), empty, WED_10AM);
    expect(due?.kind).toBe("cutoff");
    expect(due?.channels).toEqual(["email", "sms"]);
  });

  it("does not cutoff-nag a link issued the same day", () => {
    const due = computeDueReminder(openReq({ created_at: "2026-07-22T00:30:00Z" }), empty, WED_10AM);
    // same Sydney day as the cutoff run, age 0 → no drip either
    expect(due).toBeNull();
  });

  it("suppresses when already reminded today", () => {
    // Sydney Wed 08:00 (same Sydney day as WED_10AM) → once-per-day guard trips.
    const due = computeDueReminder(openReq({ last_reminder_at: "2026-07-21T22:00:00Z" }), empty, WED_10AM);
    expect(due).toBeNull();
  });

  it("suppresses outside civil hours", () => {
    expect(computeDueReminder(openReq(), empty, THU_6AM)).toBeNull();
  });

  it("suppresses when complete, opted out, cancelled, or expired", () => {
    expect(computeDueReminder(openReq(), { received: 7, total: 7 }, THU_10AM)).toBeNull();
    expect(computeDueReminder(openReq({ reminders_opted_out: true }), empty, THU_10AM)).toBeNull();
    expect(computeDueReminder(openReq({ status: "cancelled" }), empty, THU_10AM)).toBeNull();
    expect(computeDueReminder(openReq({ expires_at: "2026-07-21T00:00:00Z" }), empty, THU_10AM)).toBeNull();
  });
});

describe("deadlineLine", () => {
  it("says 'today is the cutoff' on Wednesday, 'by Wednesday 5pm' otherwise", () => {
    expect(deadlineLine(WED_10AM).toLowerCase()).toContain("today is the cutoff");
    expect(deadlineLine(THU_10AM).toLowerCase()).toContain("wednesday 5pm");
  });
});

describe("renderReminder", () => {
  const progress = computeProgress([{ doc_type: "payslip", status: "uploaded" }]); // ato_income outstanding

  it("pushes the myGov guide + reply-for-help when the ATO statement is outstanding", () => {
    const r = renderReminder("nudge2", { applicantName: "David Halliday", link: "https://x/portal/abc", progress, now: THU_10AM });
    expect(r.html).toContain("/api/portal/mygov-guide");
    expect(r.html.toLowerCase()).toContain("mygov");
    expect(r.subject.length).toBeGreaterThan(0);
  });

  it("builds an SMS with the link, the deadline intent and an opt-out", () => {
    const r = renderReminder("cutoff", { applicantName: "David Halliday", link: "https://x/portal/abc", progress, now: WED_10AM });
    expect(r.sms).toContain("https://x/portal/abc");
    expect(r.sms).toContain("Glenn from NextKey");
    expect(r.sms).toContain("Reply STOP");
  });

  it("greets by first name and carries the deadline in the email body", () => {
    const r = renderReminder("nudge1", { applicantName: "David Halliday", link: "https://x/portal/abc", progress, now: THU_10AM });
    expect(r.html).toContain("Hi David,");
    expect(r.text).toContain("Wednesday 5pm");
    expect(r.text).toContain("https://x/portal/abc");
  });
});
