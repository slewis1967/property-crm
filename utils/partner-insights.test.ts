import { describe, expect, it } from "vitest";
import { buildInsights, compactAud, dashboardStats, freshLots, isNewThisWeek, lotsForClient } from "./partner-insights";
import { NOW, day, lot } from "./partner-week-fixtures";

describe("dashboardStats", () => {
  it("counts from real data only", () => {
    const lots = [
      lot(),
      lot({ suburb: "Werribee", listedAt: day(30) }),
      lot({ availability: "on_hold" }),
      lot({ availability: "unavailable", suburb: "Gone" }),
    ];
    const s = dashboardStats(
      lots,
      [
        { state: "VIC", budgetMax: 700_000, status: "active" },
        { state: null, budgetMax: null, status: "archived" },
      ],
      [{ stage: "hold" }, { stage: "settled" }, { stage: "requested" }],
      NOW,
    );
    expect(s).toEqual({ available: 2, newThisWeek: 2, suburbs: 2, states: 1, clients: 1, activeHolds: 2 });
  });
});

describe("isNewThisWeek", () => {
  it("uses listedAt within 7 days", () => {
    expect(isNewThisWeek({ listedAt: day(6) }, NOW)).toBe(true);
    expect(isNewThisWeek({ listedAt: day(8) }, NOW)).toBe(false);
    expect(isNewThisWeek({ listedAt: null }, NOW)).toBe(false);
  });
});

describe("compactAud", () => {
  it("rounds for headlines", () => {
    expect(compactAud(650_000)).toBe("$650k");
    expect(compactAud(1_200_000)).toBe("$1.2m");
    expect(compactAud(2_000_000)).toBe("$2m");
  });
});

describe("lotsForClient", () => {
  it("matches state and budget on available lots", () => {
    const lots = [
      lot({ price: 550_000 }),
      lot({ price: 800_000 }),
      lot({ state: "QLD", price: 500_000 }),
      lot({ availability: "on_hold", price: 500_000 }),
    ];
    expect(lotsForClient({ state: "VIC", budgetMax: 600_000, status: "active" }, lots)).toHaveLength(1);
    expect(lotsForClient({ state: null, budgetMax: 600_000, status: "active" }, lots)).toHaveLength(2);
    expect(lotsForClient({ state: "VIC", budgetMax: null, status: "active" }, lots)).toHaveLength(0);
  });
});

describe("buildInsights", () => {
  it("writes the headline insights from the numbers", () => {
    const lots = [
      ...Array.from({ length: 12 }, (_, i) => lot({ price: 560_000 + i * 5_000 })),
      lot({ suburb: "Ripley", state: "QLD", bedrooms: 3, price: 480_000, listedAt: day(40) }),
    ];
    const clients = [
      { state: "VIC", budgetMax: 650_000, status: "active" },
      { state: "VIC", budgetMax: 600_000, status: "active" },
      { state: "VIC", budgetMax: 700_000, status: "active" },
    ];
    const out = buildInsights(lots, clients, [{ stage: "hold" }], NOW);
    expect(out.find((i) => i.id === "fresh")?.title).toBe("9 new 4-bed lots under $600k in VIC this week");
    expect(out.find((i) => i.id === "matches")?.title).toBe("3 of your clients match lots in Tarneit");
    expect(out.find((i) => i.id === "entry")?.title).toBe("3+ bed homes from $480k in Ripley QLD");
    expect(out.find((i) => i.id === "holds")?.title).toBe("1 deal in progress");
    expect(out.find((i) => i.id === "fresh")?.href).toContain("state=VIC");
  });
  it("invites a first client when there are none", () => {
    expect(buildInsights([lot()], [], [], NOW).find((i) => i.id === "matches")?.href).toBe("/partner/clients/new");
  });
  it("never mentions fees, rent or growth", () => {
    const json = JSON.stringify(buildInsights([lot(), lot()], [{ state: "VIC", budgetMax: 700_000, status: "active" }], [], NOW));
    expect(json).not.toMatch(/fee|rent|yield|growth|25,000|620/i);
  });
});

describe("freshLots", () => {
  it("returns newest available first", () => {
    const a = lot({ listedAt: day(5) });
    const b = lot({ listedAt: day(1) });
    const c = lot({ listedAt: day(0), availability: "on_hold" });
    expect(freshLots([a, b, c], 5).map((l) => l.id)).toEqual([b.id, a.id]);
  });
});
