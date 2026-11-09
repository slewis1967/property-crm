import { describe, expect, it } from "vitest";
import { dialable, smsHref, telHref } from "./phone-links";

describe("dialable", () => {
  it("strips spaces, dashes and brackets", () => {
    expect(dialable("0412 345 678")).toBe("0412345678");
    expect(dialable("(07) 3123-4567")).toBe("0731234567");
  });

  it("keeps a leading + for international numbers", () => {
    expect(dialable("+61 412 345 678")).toBe("+61412345678");
  });

  it("rejects empty or too-short values", () => {
    expect(dialable(null)).toBeNull();
    expect(dialable("")).toBeNull();
    expect(dialable("n/a")).toBeNull();
    expect(dialable("123")).toBeNull();
  });
});

describe("telHref / smsHref", () => {
  it("builds links from the dialable number", () => {
    expect(telHref("0412 345 678")).toBe("tel:0412345678");
    expect(smsHref("+61 412 345 678")).toBe("sms:+61412345678");
  });

  it("returns null when there is nothing to dial", () => {
    expect(telHref(undefined)).toBeNull();
    expect(smsHref("-")).toBeNull();
  });
});
