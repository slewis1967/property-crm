import { describe, it, expect } from "vitest";
import { signBrand, signBrandStyle, SIGN_BRANDS } from "./sign-brand";
import { signEmailHtml } from "./signature-requests-create";

/**
 * Which business a signer sees.
 *
 * The signing page and both emails were hardcoded NextKey. That is right for a
 * NextKey client signing a fact find and wrong for a Springboard client signing
 * their Referral Consent and Privacy Form — they have never heard of NextKey,
 * and the form names Springboard Homes as the party collecting their
 * information. Being asked to sign it under another company's letterhead is a
 * reason not to sign.
 */

describe("signBrand", () => {
  it("recognises the two brands", () => {
    expect(signBrand("springboard")).toBe("springboard");
    expect(signBrand("nextkey")).toBe("nextkey");
    expect(SIGN_BRANDS).toEqual(["nextkey", "springboard"]);
  });

  /**
   * The default direction matters. Every row written before the column existed
   * was SEEN by its signer as NextKey, and the signed copy in their inbox says
   * so — defaulting to anything else would make the record disagree with what
   * the person actually saw.
   */
  it("defaults to nextkey for anything unrecognised", () => {
    for (const v of [null, undefined, "", "Springboard", "SPRINGBOARD", "yla", "other"]) {
      expect(signBrand(v)).toBe("nextkey");
    }
  });
});

describe("signBrandStyle", () => {
  it("gives Springboard its own name, colour and sender identity", () => {
    const s = signBrandStyle("springboard");
    expect(s.name).toBe("Springboard Homes");
    expect(s.identity).toBe("springboard");
    expect(s.secured).toBe("Springboard Homes");
    // The amber used across the introducer portal and the consent form itself.
    expect(s.colour).toBe("#c7894e");
  });

  it("keeps NextKey as it was", () => {
    const s = signBrandStyle("nextkey");
    expect(s.name).toBe("NextKey Property Strategists");
    expect(s.identity).toBe("default");
  });

  /** A NextKey document must never go out under a Springboard sender. */
  it("never crosses the sender identities over", () => {
    expect(signBrandStyle("nextkey").identity).not.toBe(signBrandStyle("springboard").identity);
  });
});

describe("the request email", () => {
  it("wears the Springboard letterhead when the request is Springboard's", () => {
    const html = signEmailHtml("Ada", "Referral Consent and Privacy Form", "https://x/sign/t", "", "springboard");
    expect(html).toContain("Springboard Homes");
    expect(html).not.toContain("NextKey Property Strategists");
  });

  /** Unchanged for every existing caller, which passes no brand at all. */
  it("stays NextKey by default", () => {
    const html = signEmailHtml("Ada", "Borrower Fact Find", "https://x/sign/t", "");
    expect(html).toContain("NextKey Property Strategists");
    expect(html).not.toContain("Springboard Homes");
  });

  it("still escapes what it is given", () => {
    const html = signEmailHtml("<script>x</script>", "Doc", "https://x/sign/t", "", "springboard");
    expect(html).not.toContain("<script>x</script>");
  });
});
