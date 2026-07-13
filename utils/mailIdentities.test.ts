import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  resolveIdentity,
  isMailIdentityKey,
  MAIL_IDENTITY_KEYS,
  DEFAULT_IDENTITY_KEY,
} from "./mailIdentities";

describe("resolveIdentity", () => {
  const saved = {
    BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME,
    SPRINGBOARD_SENDER_EMAIL: process.env.SPRINGBOARD_SENDER_EMAIL,
    SPRINGBOARD_SENDER_NAME: process.env.SPRINGBOARD_SENDER_NAME,
  };

  beforeEach(() => {
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.BREVO_SENDER_NAME;
    delete process.env.SPRINGBOARD_SENDER_EMAIL;
    delete process.env.SPRINGBOARD_SENDER_NAME;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("resolves the nextkey identity with its env-backed envelope", () => {
    process.env.BREVO_SENDER_EMAIL = "hello@nextkey.com.au";
    process.env.BREVO_SENDER_NAME = "NextKey Property Strategists";
    const id = resolveIdentity("nextkey");
    expect(id.key).toBe("nextkey");
    expect(id.fromEmail).toBe("hello@nextkey.com.au");
    expect(id.fromName).toBe("NextKey Property Strategists");
  });

  it("resolves the springboard identity with its env-backed envelope", () => {
    process.env.SPRINGBOARD_SENDER_EMAIL = "hello@springboardhomes.com.au";
    process.env.SPRINGBOARD_SENDER_NAME = "Springboard Homes";
    const id = resolveIdentity("springboard");
    expect(id.key).toBe("springboard");
    expect(id.fromEmail).toBe("hello@springboardhomes.com.au");
    expect(id.fromName).toBe("Springboard Homes");
  });

  it("falls back to safe (Brevo-validated) defaults when env is unset", () => {
    // The NextKey default must be a Brevo-validated address so mail delivers;
    // hello@nextkey.com.au is not yet validated (see resolveIdentity comment).
    expect(resolveIdentity("nextkey").fromEmail).toBe("sean.l@nextkey.com.au");
    expect(resolveIdentity("nextkey").fromName).toBe("NextKey Property Strategists");
    expect(resolveIdentity("springboard").fromEmail).toBe("hello@springboardhomes.com.au");
    expect(resolveIdentity("springboard").fromName).toBe("Springboard Homes");
  });

  it("falls back to nextkey for unknown, null, or empty keys", () => {
    expect(resolveIdentity("unknown").key).toBe("nextkey");
    expect(resolveIdentity("").key).toBe("nextkey");
    expect(resolveIdentity(null).key).toBe("nextkey");
    expect(resolveIdentity(undefined).key).toBe(DEFAULT_IDENTITY_KEY);
  });
});

describe("isMailIdentityKey", () => {
  it("accepts the known keys", () => {
    for (const k of MAIL_IDENTITY_KEYS) expect(isMailIdentityKey(k)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isMailIdentityKey("ghl")).toBe(false);
    expect(isMailIdentityKey("")).toBe(false);
    expect(isMailIdentityKey(null)).toBe(false);
    expect(isMailIdentityKey(42)).toBe(false);
  });
});
