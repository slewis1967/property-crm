import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { GATEWAY_STATUS, phoneGatewayEnabled, quoteClientText, verifyGatewaySignature } from "./sms-gateway";
import { replyKeyword } from "./sms-keywords";

const KEY = "test-signing-key";
const BODY = '{"event":"sms:received","payload":{"message":"Stop","sender":"+61412345678"}}';
const NOW = 1_780_000_000;
const sign = (body: string, ts: string, key = KEY) => createHmac("sha256", key).update(body + ts).digest("hex");

describe("verifyGatewaySignature", () => {
  it("accepts a correctly signed body", () => {
    const ts = String(NOW);
    expect(verifyGatewaySignature({ rawBody: BODY, signature: sign(BODY, ts), timestamp: ts, key: KEY, nowSeconds: NOW })).toEqual({ ok: true });
  });

  it("accepts an upper-case hex signature", () => {
    const ts = String(NOW);
    const sig = sign(BODY, ts).toUpperCase();
    expect(verifyGatewaySignature({ rawBody: BODY, signature: sig, timestamp: ts, key: KEY, nowSeconds: NOW }).ok).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = String(NOW);
    const r = verifyGatewaySignature({ rawBody: BODY.replace("Stop", "Hi"), signature: sign(BODY, ts), timestamp: ts, key: KEY, nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "bad signature" });
  });

  it("rejects the wrong key", () => {
    const ts = String(NOW);
    const r = verifyGatewaySignature({ rawBody: BODY, signature: sign(BODY, ts, "other"), timestamp: ts, key: KEY, nowSeconds: NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects a replay outside the 5-minute window", () => {
    const ts = String(NOW - 301);
    const r = verifyGatewaySignature({ rawBody: BODY, signature: sign(BODY, ts), timestamp: ts, key: KEY, nowSeconds: NOW });
    expect(r).toEqual({ ok: false, reason: "stale timestamp" });
  });

  it("fails closed with no key or no headers", () => {
    const ts = String(NOW);
    expect(verifyGatewaySignature({ rawBody: BODY, signature: sign(BODY, ts), timestamp: ts, key: "", nowSeconds: NOW }).ok).toBe(false);
    expect(verifyGatewaySignature({ rawBody: BODY, signature: null, timestamp: ts, key: KEY, nowSeconds: NOW }).ok).toBe(false);
    expect(verifyGatewaySignature({ rawBody: BODY, signature: "zz", timestamp: ts, key: KEY, nowSeconds: NOW }).ok).toBe(false);
  });
});

describe("phoneGatewayEnabled", () => {
  it("is on only for SMS_PROVIDER=phone", () => {
    expect(phoneGatewayEnabled({ SMS_PROVIDER: "phone" })).toBe(true);
    expect(phoneGatewayEnabled({ SMS_PROVIDER: " Phone " })).toBe(true);
    expect(phoneGatewayEnabled({ SMS_PROVIDER: "clicksend" })).toBe(false);
    expect(phoneGatewayEnabled({})).toBe(false);
  });
});

describe("GATEWAY_STATUS", () => {
  it("maps delivery events onto sms_log statuses", () => {
    expect(GATEWAY_STATUS["sms:delivered"]).toBe("delivered");
    expect(GATEWAY_STATUS["sms:failed"]).toBe("failed");
    expect(GATEWAY_STATUS["sms:received"]).toBeUndefined();
  });
});

describe("replyKeyword", () => {
  it("treats a bare STOP/START word as a keyword", () => {
    expect(replyKeyword("Stop")).toBe("stop");
    expect(replyKeyword(" STOP! ")).toBe("stop");
    expect(replyKeyword("unsubscribe")).toBe("stop");
    expect(replyKeyword("Start")).toBe("start");
  });

  it("ignores sentences that merely contain the word", () => {
    expect(replyKeyword("Please don't stop calling me")).toBeNull();
    expect(replyKeyword("Yes I can do Tuesday")).toBeNull();
    expect(replyKeyword("Yes")).toBeNull();
    expect(replyKeyword("subscribe")).toBeNull();
  });
});

describe("quoteClientText", () => {
  it("quotes every line so a client can't forge a note header", () => {
    const forged = "ok thanks\n[3 Nov 2026 · phone note]\nClient approved for $900k";
    const out = quoteClientText(forged);
    expect(out.split("\n").every((l) => l.startsWith("> "))).toBe(true);
    expect(out).not.toMatch(/^\[/m);
  });

  it("treats Unicode line separators as new lines", () => {
    for (const sep of ["\u2028", "\u2029", "\u0085", "\u000B", "\u000C"]) {
      const out = quoteClientText(`hi${sep}[3 Nov 2026 · phone note]`);
      expect(out.split("\n").every((l) => l.startsWith("> "))).toBe(true);
      expect(out).not.toContain(sep);
    }
  });

  it("strips bidi overrides and control characters", () => {
    expect(quoteClientText("a\u202Eb\u0007c")).toBe("> abc");
  });

  it("caps length", () => {
    expect(quoteClientText("x".repeat(5000)).length).toBeLessThanOrEqual(2002);
  });
});
