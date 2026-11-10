/**
 * Pins the two vendor response shapes. The payload fixtures below are VERBATIM
 * captures from the live APIs on 2026-07-25 (trimmed of unrelated fields), so if
 * either vendor changes its contract these fail loudly here rather than silently
 * writing NaN over a balance the low-balance alert depends on.
 *
 * `refreshBalances()` itself is DB+network and isn't covered here.
 */
import { describe, it, expect } from "vitest";
import { parseClickSendAccount, parseOpenRouterCredits } from "./paid-service-balances";

describe("parseOpenRouterCredits", () => {
  // Live capture: GET https://openrouter.ai/api/v1/credits
  const real = { data: { total_credits: 179, total_usage: 149.237789982 } };

  it("derives remaining from credits minus usage (the API doesn't return it)", () => {
    const r = parseOpenRouterCredits(real);
    expect(r.remaining).toBe(29.76);
    expect(r.unit).toBe("USD");
    expect(r.meta).toEqual({ total_credits: 179, total_usage: 149.24 });
  });

  it("can go negative rather than clamping — an overdrawn account must not look fine", () => {
    expect(parseOpenRouterCredits({ data: { total_credits: 10, total_usage: 12.5 } }).remaining).toBe(-2.5);
  });

  it("throws instead of writing NaN when the shape changes", () => {
    expect(() => parseOpenRouterCredits({ data: { credits: 5 } })).toThrow(/unexpected/);
    expect(() => parseOpenRouterCredits({})).toThrow(/unexpected/);
    expect(() => parseOpenRouterCredits(null)).toThrow(/unexpected/);
  });
});

describe("parseClickSendAccount", () => {
  // Live capture: GET https://rest.clicksend.com/v3/account
  const real = {
    http_code: 200,
    response_code: "SUCCESS",
    data: {
      username: "slewis877@gmail.com",
      balance: "74.970400", // NOTE: a string
      auto_recharge: 0,
      auto_recharge_amount: "20.00",
      _currency: { currency_name_short: "AUD", currency_name_long: "Australian Dollars" },
    },
  };

  it("reads the string balance and the currency", () => {
    const r = parseClickSendAccount(real);
    expect(r.remaining).toBe(74.97);
    expect(r.unit).toBe("AUD");
  });

  it("carries auto-recharge state — an account with it OFF is the one that runs dry", () => {
    expect(parseClickSendAccount(real).meta).toEqual({ auto_recharge: false });
    const on = { data: { ...real.data, auto_recharge: 1 } };
    expect(parseClickSendAccount(on).meta).toEqual({ auto_recharge: true });
  });

  it("falls back to AUD when the currency block is absent", () => {
    expect(parseClickSendAccount({ data: { balance: "10.00" } }).unit).toBe("AUD");
  });

  it("throws instead of writing NaN when the shape changes", () => {
    expect(() => parseClickSendAccount({ data: { balance: "not-a-number" } })).toThrow(/unexpected/);
    expect(() => parseClickSendAccount({ data: {} })).toThrow(/unexpected/);
  });
});
