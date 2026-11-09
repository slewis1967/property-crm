import { describe, it, expect } from "vitest";
import { checkEmail, checkPhone, type MailResolver } from "./lead-check";

const noRecord = () => Promise.reject(Object.assign(new Error("none"), { code: "ENOTFOUND" }));
const servfail = () => Promise.reject(Object.assign(new Error("down"), { code: "ESERVFAIL" }));

const hasMx: MailResolver = { resolveMx: async () => [{ exchange: "mx", priority: 1 }], resolve4: noRecord };
const noMail: MailResolver = { resolveMx: noRecord, resolve4: noRecord };
const aOnly: MailResolver = { resolveMx: noRecord, resolve4: async () => ["1.2.3.4"] };
const dnsDown: MailResolver = { resolveMx: servfail, resolve4: servfail };

describe("checkPhone", () => {
  it.each(["0412 678 901", "+61 412 678 901", "61412678901"])("accepts the Australian mobile %s", (n) => {
    expect(checkPhone(n)).toEqual({ ok: true, kind: "au_mobile" });
  });

  it("accepts landlines and overseas numbers", () => {
    expect(checkPhone("02 6123 4567")).toEqual({ ok: true, kind: "au_landline" });
    expect(checkPhone("+61 2 9876 5431")).toEqual({ ok: true, kind: "au_landline" });
    expect(checkPhone("+86 138 0013 8000")).toEqual({ ok: true, kind: "overseas" });
  });

  it.each(["0400 000 000", "0411111111", "0412345678", "0498 765 432"])("refuses the fake %s", (n) => {
    expect(checkPhone(n)).toMatchObject({ ok: false, message: expect.stringContaining("real phone number") });
  });

  it.each(["", "12345", "+1 555", "0512 678 901", "04126789", "0455867214<img src=x>"])("refuses the malformed %j", (n) => {
    expect(checkPhone(n).ok).toBe(false);
  });
});

describe("checkEmail", () => {
  it("accepts a real address", async () => {
    expect(await checkEmail("someone@example-business.com.au", hasMx)).toEqual({ ok: true });
  });

  it("accepts a domain with only an A record", async () => {
    expect(await checkEmail("someone@example-business.com.au", aOnly)).toEqual({ ok: true });
  });

  it("refuses throwaway domains, subdomains included", async () => {
    for (const e of ["a@mailinator.com", "a@sub.guerrillamail.com"]) {
      expect(await checkEmail(e, hasMx)).toMatchObject({ ok: false, message: expect.stringContaining("temporary") });
    }
  });

  it("hints at mistyped providers even though they may accept mail", async () => {
    expect(await checkEmail("a@gmial.com", hasMx)).toMatchObject({
      ok: false,
      message: expect.stringContaining("gmail.com"),
    });
  });

  it("refuses a domain that can't receive mail", async () => {
    expect(await checkEmail("a@no-such-domain-xyz.com.au", noMail)).toMatchObject({
      ok: false,
      message: expect.stringContaining("can't receive mail"),
    });
  });

  it("fails open when DNS itself is down", async () => {
    expect(await checkEmail("a@example-business.com.au", dnsDown)).toEqual({ ok: true });
  });

  it("refuses bad syntax", async () => {
    expect((await checkEmail("not-an-email", hasMx)).ok).toBe(false);
  });

  it.each(["a@mailinator.com.", "a@example..com", "a@-example.com", "a@exa_mple.com", "a@evil%2ecom", "a@a.com/x", "a@a.com?x"])(
    "refuses the malformed domain %s before any lookup",
    async (e) => {
      expect(await checkEmail(e, hasMx)).toMatchObject({ ok: false, message: "Please enter a valid email address." });
    },
  );

  it("accepts an international domain", async () => {
    expect(await checkEmail("a@müller-bau.de", hasMx)).toEqual({ ok: true });
  });
});
