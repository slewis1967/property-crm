import { describe, it, expect } from "vitest";
import {
  addMonths,
  advanceDueDate,
  assessAll,
  actionable,
  attentionFor,
  brisbaneToday,
  cardExpiryLastDay,
  cycleMonths,
  daysUntil,
  monthlyEquivalent,
  summarise,
  type PaidService,
} from "./paid-services";

const TODAY = "2026-07-25";

function svc(over: Partial<PaidService> = {}): PaidService {
  return {
    id: "s1",
    name: "Test Service",
    category: "infrastructure",
    purpose: null,
    criticality: "important",
    status: "active",
    vendor_url: null,
    account_ref: null,
    plan: null,
    cost: 50,
    currency: "AUD",
    billing_cycle: "monthly",
    next_due_date: null,
    last_paid_on: null,
    auto_renew: true,
    payment_method: null,
    card_expiry: null,
    balance_remaining: null,
    balance_unit: null,
    low_balance_threshold: null,
    alert_lead_days: 7,
    snoozed_until: null,
    notes: null,
    ...over,
  };
}

const kinds = (s: PaidService, today = TODAY) => attentionFor(s, today).items.map((i) => i.kind);

describe("date helpers", () => {
  it("counts whole days in both directions", () => {
    expect(daysUntil("2026-07-25", TODAY)).toBe(0);
    expect(daysUntil("2026-07-28", TODAY)).toBe(3);
    expect(daysUntil("2026-07-20", TODAY)).toBe(-5);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil("not-a-date", TODAY)).toBeNull();
  });

  it("crosses a month and a year boundary correctly", () => {
    expect(daysUntil("2026-08-01", "2026-07-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });

  it("clamps the day when adding months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29"); // leap year
    expect(addMonths("2026-07-15", 12)).toBe("2027-07-15");
  });

  it("reads a card expiry as the LAST day of that month", () => {
    expect(cardExpiryLastDay("2026-07")).toBe("2026-07-31");
    expect(cardExpiryLastDay("2026-2")).toBe("2026-02-28");
    expect(cardExpiryLastDay("2026-13")).toBeNull();
    expect(cardExpiryLastDay(null)).toBeNull();
  });

  it("knows the period of each cycle", () => {
    expect(cycleMonths("monthly")).toBe(1);
    expect(cycleMonths("quarterly")).toBe(3);
    expect(cycleMonths("annual")).toBe(12);
    expect(cycleMonths("usage")).toBeNull();
    expect(cycleMonths("prepaid")).toBeNull();
  });

  it("returns a Brisbane-local ISO day", () => {
    // 2026-07-25 14:00 UTC is already the 26th in Brisbane (UTC+10).
    expect(brisbaneToday(new Date("2026-07-25T14:00:00Z"))).toBe("2026-07-26");
    expect(brisbaneToday(new Date("2026-07-25T13:00:00Z"))).toBe("2026-07-25");
  });
});

describe("advanceDueDate", () => {
  it("rolls forward from the scheduled date, keeping the anniversary", () => {
    // Paid 3 days late — the next one is still the 22nd, not the 25th.
    expect(advanceDueDate("2026-07-22", "monthly", TODAY)).toBe("2026-08-22");
    expect(advanceDueDate("2026-07-22", "annual", TODAY)).toBe("2027-07-22");
  });

  it("keeps rolling when the next date would still be in the past", () => {
    // Four months unpaid: one +1mo step would land in April, still behind.
    expect(advanceDueDate("2026-03-10", "monthly", TODAY)).toBe("2026-08-10");
  });

  it("has no answer for non-periodic cycles", () => {
    expect(advanceDueDate("2026-07-22", "usage", TODAY)).toBeNull();
    expect(advanceDueDate("2026-07-22", "prepaid", TODAY)).toBeNull();
  });
});

describe("attentionFor — payment timing", () => {
  it("flags an overdue payment as critical", () => {
    const a = attentionFor(svc({ next_due_date: "2026-07-20" }), TODAY);
    expect(a.worst).toBe("critical");
    const overdue = a.items.find((i) => i.kind === "overdue")!;
    expect(overdue.headline).toContain("overdue by 5 days");
    expect(overdue.days).toBe(-5);
  });

  it("warns inside the lead window and stays quiet outside it", () => {
    expect(kinds(svc({ next_due_date: "2026-07-30" }))).toContain("due_soon");
    expect(kinds(svc({ next_due_date: "2026-08-30" }))).not.toContain("due_soon");
  });

  it("respects a per-account lead time", () => {
    expect(kinds(svc({ next_due_date: "2026-08-10" }))).not.toContain("due_soon");
    expect(kinds(svc({ next_due_date: "2026-08-10", alert_lead_days: 30 }))).toContain("due_soon");
  });

  it("escalates an imminent MANUAL payment to critical, but not an auto-renewal", () => {
    const manual = attentionFor(svc({ next_due_date: "2026-07-26", auto_renew: false }), TODAY);
    expect(manual.worst).toBe("critical");
    const auto = attentionFor(svc({ next_due_date: "2026-07-26", auto_renew: true }), TODAY);
    expect(auto.worst).toBe("warning");
  });

  it("says 'due today' on the day itself", () => {
    const a = attentionFor(svc({ next_due_date: TODAY }), TODAY);
    expect(a.items.find((i) => i.kind === "due_soon")!.headline).toContain("due today");
  });

  it("flags a recurring account with no renewal date, so silence is never mistaken for safety", () => {
    expect(kinds(svc({ next_due_date: null, billing_cycle: "annual" }))).toContain("missing_billing_date");
    // Usage-based billing has no renewal date to record.
    expect(kinds(svc({ next_due_date: null, billing_cycle: "usage", cost: null }))).not.toContain("missing_billing_date");
  });
});

describe("attentionFor — suppression", () => {
  it("stays silent for cancelled and paused accounts", () => {
    for (const status of ["cancelled", "paused"]) {
      const a = attentionFor(svc({ status, next_due_date: "2026-01-01", cost: null }), TODAY);
      expect(a.items).toEqual([]);
      expect(a.worst).toBeNull();
    }
  });

  it("marks a snoozed account so callers can drop it from the digest", () => {
    const snoozed = attentionFor(svc({ next_due_date: "2026-07-20", snoozed_until: "2026-07-31" }), TODAY);
    expect(snoozed.snoozed).toBe(true);
    expect(snoozed.items.length).toBeGreaterThan(0); // still visible in the panel
    expect(actionable([snoozed])).toEqual([]); // but not in the digest

    const expired = attentionFor(svc({ next_due_date: "2026-07-20", snoozed_until: "2026-07-24" }), TODAY);
    expect(expired.snoozed).toBe(false);
    expect(actionable([expired]).length).toBe(1);
  });
});

describe("attentionFor — card, trial, balance", () => {
  it("is critical when the card dies before the next charge", () => {
    const a = attentionFor(
      svc({ next_due_date: "2026-09-15", card_expiry: "2026-08", payment_method: "Amex ••1234" }),
      TODAY,
    );
    const card = a.items.find((i) => i.kind === "card_expiring")!;
    expect(card.severity).toBe("critical");
    expect(card.detail).toContain("before the 2026-09-15 renewal");
  });

  it("only warns when the card outlives the next charge", () => {
    // Card dies 2026-08-31 (37 days out, inside the 60-day window) but the
    // 28 Jul charge clears first — worth knowing, not urgent.
    const a = attentionFor(svc({ next_due_date: "2026-07-28", card_expiry: "2026-08" }), TODAY);
    expect(a.items.find((i) => i.kind === "card_expiring")!.severity).toBe("warning");
  });

  it("is critical once the card has actually expired", () => {
    const a = attentionFor(svc({ card_expiry: "2026-06" }), TODAY);
    expect(a.items.find((i) => i.kind === "card_expiring")!.severity).toBe("critical");
  });

  it("ignores a card expiring far out", () => {
    expect(kinds(svc({ card_expiry: "2029-01" }))).not.toContain("card_expiring");
  });

  it("flags a trial about to end", () => {
    const a = attentionFor(svc({ status: "trial", next_due_date: "2026-07-29" }), TODAY);
    expect(kinds(svc({ status: "trial", next_due_date: "2026-07-29" }))).toContain("trial_ending");
    expect(a.worst).toBe("warning");
  });

  it("grades a prepaid balance: low warns, empty is critical", () => {
    const low = attentionFor(svc({ balance_remaining: 8, low_balance_threshold: 20, balance_unit: "AUD" }), TODAY);
    expect(low.items.find((i) => i.kind === "low_balance")!.severity).toBe("warning");

    const empty = attentionFor(svc({ balance_remaining: 0, low_balance_threshold: 20 }), TODAY);
    expect(empty.items.find((i) => i.kind === "low_balance")!.severity).toBe("critical");

    const healthy = attentionFor(svc({ balance_remaining: 500, low_balance_threshold: 20 }), TODAY);
    expect(kinds(healthy.service)).not.toContain("low_balance");
  });

  it("nags (info only) about a missing cost", () => {
    const a = attentionFor(svc({ cost: null }), TODAY);
    expect(kinds(svc({ cost: null }))).toContain("missing_cost");
    expect(a.worst).toBe("info");
    expect(actionable([a])).toEqual([]); // info never reaches the digest
  });
});

describe("spend maths", () => {
  it("normalises each cycle to a month", () => {
    expect(monthlyEquivalent(svc({ cost: 30, billing_cycle: "monthly" }))).toBe(30);
    expect(monthlyEquivalent(svc({ cost: 300, billing_cycle: "quarterly" }))).toBe(100);
    expect(monthlyEquivalent(svc({ cost: 1200, billing_cycle: "annual" }))).toBe(100);
  });

  it("has no monthly figure for usage, prepaid, unknown cost or a dead account", () => {
    expect(monthlyEquivalent(svc({ billing_cycle: "usage" }))).toBeNull();
    expect(monthlyEquivalent(svc({ billing_cycle: "prepaid" }))).toBeNull();
    expect(monthlyEquivalent(svc({ cost: null }))).toBeNull();
    expect(monthlyEquivalent(svc({ status: "cancelled" }))).toBeNull();
  });

  it("totals per currency instead of inventing an exchange rate", () => {
    const s = summarise(
      [
        svc({ id: "a", name: "A", cost: 100, currency: "AUD", billing_cycle: "monthly" }),
        svc({ id: "b", name: "B", cost: 1200, currency: "AUD", billing_cycle: "annual" }),
        svc({ id: "c", name: "C", cost: 20, currency: "USD", billing_cycle: "monthly" }),
      ],
      TODAY,
    );
    expect(s.spendByCurrency).toEqual([
      { currency: "AUD", monthly: 200, annual: 2400 },
      { currency: "USD", monthly: 20, annual: 240 },
    ]);
  });

  it("counts what it cannot budget rather than treating it as zero", () => {
    const s = summarise([svc({ id: "a", billing_cycle: "usage", cost: null }), svc({ id: "b", cost: 10 })], TODAY);
    expect(s.unbudgeted).toBe(1);
  });

  it("counts only non-snoozed warning+ accounts as needing attention", () => {
    const s = summarise(
      [
        svc({ id: "a", name: "Overdue", next_due_date: "2026-07-01" }),
        svc({ id: "b", name: "Due soon", next_due_date: "2026-07-27" }),
        svc({ id: "c", name: "Snoozed", next_due_date: "2026-07-01", snoozed_until: "2026-08-01" }),
        svc({ id: "d", name: "Info only", cost: null, next_due_date: "2026-12-01" }),
        svc({ id: "e", name: "Fine", next_due_date: "2026-12-01" }),
      ],
      TODAY,
    );
    expect(s.needingAttention).toBe(2);
    expect(s.criticalCount).toBe(1);
    expect(s.warningCount).toBe(1);
    expect(s.total).toBe(5);
  });
});

describe("assessAll ordering", () => {
  it("puts the worst first, then the soonest", () => {
    const order = assessAll(
      [
        svc({ id: "1", name: "Fine", next_due_date: "2026-12-01" }),
        svc({ id: "2", name: "SoonB", next_due_date: "2026-07-30" }),
        svc({ id: "3", name: "Overdue", next_due_date: "2026-07-01" }),
        svc({ id: "4", name: "SoonA", next_due_date: "2026-07-26" }),
      ],
      TODAY,
    ).map((a) => a.service.name);
    expect(order.slice(0, 3)).toEqual(["Overdue", "SoonA", "SoonB"]);
  });
});
