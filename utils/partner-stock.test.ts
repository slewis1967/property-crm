import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

import { PARTNER_HIDDEN_ESTATES, hiddenEstateFilter, isHiddenEstate } from "./partner-stock";

describe("hidden estates", () => {
  it("shows The Grande and Gateway now Geocon has given written authority (20 Nov 2026)", () => {
    expect(PARTNER_HIDDEN_ESTATES).toEqual([]);
    expect(isHiddenEstate("The Grande")).toBe(false);
    expect(isHiddenEstate("Gateway")).toBe(false);
    expect(hiddenEstateFilter()).toBeNull();
  });

  it("matches hidden estates case-insensitively and exactly", () => {
    expect(isHiddenEstate("the grande ", ["The Grande"])).toBe(true);
    expect(isHiddenEstate("The Grande Residences", ["The Grande"])).toBe(false);
    expect(isHiddenEstate(null, ["The Grande"])).toBe(false);
  });

  it("builds a filter that keeps lots with no estate", () => {
    expect(hiddenEstateFilter(["The Grande"])).toBe('estate_name.is.null,and(estate_name.not.ilike."The Grande")');
    expect(hiddenEstateFilter([])).toBeNull();
  });
});
