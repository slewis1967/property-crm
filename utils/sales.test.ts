import { describe, expect, it } from "vitest";
import { depositPosition, directSaleNextStages, nextStep, parseSaleUpdate, type SaleDates } from "./sales";
import { canTransition } from "./partner";

const base: SaleDates = {
  stage: "contract_issued",
  hold_expires_at: null,
  anticipated_exchange_date: "2026-12-25",
  exchange_date: null,
  cooling_off_waived: false,
  cooling_off_expires: null,
  anticipated_settlement_date: "2026-12-30",
  settlement_date: null,
  deposit_initial_due_date: "2026-11-27",
  deposit_balance_due_date: "2026-12-25",
};
const geocon = { deposit_initial_required: 1000, deposit_balance_required: 26395 };

describe("depositPosition", () => {
  it("splits payments by kind and reports what is outstanding", () => {
    const d = depositPosition(geocon, [
      { kind: "initial_deposit", amount: 1000 },
      { kind: "balance_deposit", amount: 10000 },
    ]);
    expect(d.initialPaid).toBe(true);
    expect(d.balanceOutstanding).toBe(16395);
    expect(d.totalRequired).toBe(27395);
    expect(d.totalReceived).toBe(11000);
  });
  it("is not 'paid' when nothing was required", () => {
    expect(depositPosition({ deposit_initial_required: null, deposit_balance_required: null }, []).initialPaid).toBe(false);
  });
});

describe("nextStep", () => {
  it("puts an unpaid initial deposit first", () => {
    const s = nextStep(base, depositPosition(geocon, []), "2026-11-25");
    expect(s?.label).toBe("Initial deposit $1,000 due by 27/11/2026");
    expect(s?.overdue).toBe(false);
  });
  it("shows exchange due once the initial deposit is in", () => {
    const s = nextStep(base, depositPosition(geocon, [{ kind: "initial_deposit", amount: 1000 }]), "2026-11-25");
    expect(s?.label).toBe("Exchange due by 25/12/2026");
  });
  it("flags overdue", () => {
    const s = nextStep(base, depositPosition(geocon, [{ kind: "initial_deposit", amount: 1000 }]), "2026-12-26");
    expect(s?.overdue).toBe(true);
  });
  it("after exchange: cooling-off, then balance, then settlement", () => {
    const paidInitial = [{ kind: "initial_deposit" as const, amount: 1000 }];
    const ex = { ...base, stage: "unconditional", cooling_off_expires: "2026-12-30" };
    expect(nextStep(ex, depositPosition(geocon, paidInitial), "2026-12-26")?.label).toMatch(/^Cooling-off ends/);
    expect(nextStep({ ...ex, cooling_off_waived: true }, depositPosition(geocon, paidInitial), "2026-12-26")?.label).toMatch(/^Balance deposit \$26,395/);
    const allPaid = [...paidInitial, { kind: "balance_deposit" as const, amount: 26395 }];
    expect(nextStep({ ...ex, cooling_off_waived: true }, depositPosition(geocon, allPaid), "2026-12-26")?.label).toBe("Settlement due by 30/12/2026");
  });
  it("has no next step for a lost sale", () => {
    expect(nextStep({ ...base, stage: "released" }, depositPosition(geocon, []), "2026-11-25")).toBeNull();
  });
});

describe("stages", () => {
  it("contract issued sits between EOI and exchanged", () => {
    expect(canTransition("eoi", "contract_issued")).toBe(true);
    expect(canTransition("contract_issued", "unconditional")).toBe(true);
    expect(canTransition("contract_issued", "eoi")).toBe(false);
    expect(directSaleNextStages("contract_issued")).toEqual(["unconditional", "released"]);
  });
});

describe("parseSaleUpdate", () => {
  it("parses money, dates and booleans, ignores unknown keys", () => {
    const r = parseSaleUpdate({ sale_price: "$547,900", exchange_date: "2026-12-25", firb_required: false, partner_id: "x" });
    expect(r).toEqual({ update: { sale_price: 547900, exchange_date: "2026-12-25", firb_required: false } });
  });
  it("rejects a bad date and a non-https link", () => {
    expect(parseSaleUpdate({ exchange_date: "25/12/2026" })).toHaveProperty("error");
    expect(parseSaleUpdate({ external_url: "http://x" })).toHaveProperty("error");
  });
  it("won't null a required boolean", () => {
    expect(parseSaleUpdate({ cooling_off_waived: null })).toHaveProperty("error");
  });
});
