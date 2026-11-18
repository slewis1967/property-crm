import { describe, expect, it } from "vitest";
import { FOUNDERS, FOUNDERS_CONTACT } from "../app/partner/Founders";

describe("founders card", () => {
  it("uses the approved bios verbatim", () => {
    expect(FOUNDERS.map((f) => f.bio)).toEqual([
      "40 years in the software industry and 30 years in the finance and property industries.",
      "Over 40 years in real estate sales and marketing.",
    ]);
  });
  it("lists Glenn as the only contact and nothing of Sean's", () => {
    expect(FOUNDERS_CONTACT).toEqual({ name: "Glenn Mayes", phone: "0477 201 245", email: "glenn.m@nextkey.com.au" });
    expect(JSON.stringify(FOUNDERS)).not.toMatch(/@|\d{4}\s?\d{3}\s?\d{3}/);
  });
});
