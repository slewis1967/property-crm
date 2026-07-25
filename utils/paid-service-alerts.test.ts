/**
 * Covers the digest's rendering only — the pure exports of
 * paid-service-alerts.ts. `runPaidServiceAlerts` itself talks to Supabase and
 * Brevo, so it isn't exercised here; the decisions it makes (what counts as
 * needing attention, what reaches the digest) live in utils/paid-services.ts and
 * are covered by paid-services.test.ts.
 */
import { describe, it, expect } from "vitest";
import { digestHtml, digestSubject, digestText } from "./paid-service-alerts";
import { attentionFor, type PaidService, type ServiceAttention } from "./paid-services";

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

/** Assess a service and drop the info-only items, as the sweep does. */
function flagged(over: Partial<PaidService>): ServiceAttention {
  const a = attentionFor(svc(over), TODAY);
  return { ...a, items: a.items.filter((i) => i.severity !== "info") };
}

const overdue = flagged({ id: "a", name: "Supabase", next_due_date: "2026-07-18", cost: 35, criticality: "critical" });
const dueSoon = flagged({ id: "b", name: "Hostinger", next_due_date: "2026-07-29", cost: 180, billing_cycle: "annual" });

describe("digestSubject", () => {
  it("leads with the worst item, because that's all a phone shows", () => {
    const subject = digestSubject([overdue, dueSoon]);
    expect(subject).toContain("Action needed");
    expect(subject).toContain("Supabase");
    expect(subject).toContain("+1 more");
  });

  it("drops the counter when there's only one", () => {
    expect(digestSubject([overdue])).not.toContain("more");
  });

  it("stays calm when nothing is critical", () => {
    const subject = digestSubject([dueSoon]);
    expect(subject).not.toContain("Action needed");
    expect(subject).toContain("Hostinger");
  });

  it("counts plainly for several non-critical accounts", () => {
    expect(digestSubject([dueSoon, dueSoon])).toBe("Paid accounts: 2 accounts need attention");
  });
});

describe("digestHtml", () => {
  const html = digestHtml([overdue, dueSoon], TODAY, "about $1,200 AUD/month committed");

  it("states the problem, the amount and the date for each account", () => {
    expect(html).toContain("Supabase");
    expect(html).toContain("overdue by 7 days");
    expect(html).toContain("AUD $35");
    expect(html).toContain("2026-07-18");
  });

  it("labels severity so the eye can sort it", () => {
    expect(html).toContain("Action now");
    expect(html).toContain("Coming up");
  });

  it("carries the date, the count and the spend line", () => {
    expect(html).toContain(TODAY);
    expect(html).toContain("2 accounts");
    expect(html).toContain("about $1,200 AUD/month committed");
  });

  it("links back to the panel so the alert is actionable", () => {
    expect(html).toContain("/paid-services");
  });

  it("includes a billing link only when one is recorded", () => {
    expect(html).not.toContain("Open billing");
    const withUrl = digestHtml([flagged({ name: "Fly", next_due_date: "2026-07-20", vendor_url: "https://fly.io/x" })], TODAY, "");
    expect(withUrl).toContain("https://fly.io/x");
    expect(withUrl).toContain("Open billing");
  });

  it("escapes account names so a stray angle bracket can't break the email", () => {
    const nasty = digestHtml([flagged({ name: "A<script>x</script>B", next_due_date: "2026-07-20" })], TODAY, "");
    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
  });
});

describe("digestText", () => {
  const text = digestText([overdue, dueSoon], TODAY);

  it("mirrors the HTML for clients that show plain text", () => {
    expect(text).toContain("Supabase");
    expect(text).toContain("Hostinger");
    expect(text).toContain("ACTION NOW");
    expect(text).toContain(TODAY);
    expect(text).toContain("/paid-services");
  });

  it("carries no markup", () => {
    expect(text).not.toMatch(/<[a-z]/i);
  });
});
