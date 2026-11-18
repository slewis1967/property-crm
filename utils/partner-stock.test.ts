import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => ({ supabase: {} }));

import { PARTNER_HIDDEN_ESTATES, hiddenEstateFilter, isHiddenEstate } from "./partner-stock";

describe("hidden estates", () => {
  it("hides The Grande until Geocon gives written authority", () => {
    expect(PARTNER_HIDDEN_ESTATES).toContain("The Grande");
    expect(isHiddenEstate("the grande ")).toBe(true);
    expect(isHiddenEstate("Gateway")).toBe(false);
    expect(isHiddenEstate(null)).toBe(false);
  });

  it("builds a filter that keeps lots with no estate", () => {
    expect(hiddenEstateFilter(["The Grande"])).toBe('estate_name.is.null,and(estate_name.not.ilike."The Grande")');
    expect(hiddenEstateFilter([])).toBeNull();
  });
});
