import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendBrevoEmail } from "./brevo";

/**
 * These cover the send-failure signalling the signing routes depend on:
 *  - a non-2xx Brevo response is reported as { ok:false } (not a fake success),
 *  - a thrown fetch (network/DNS/timeout) is caught and also returned as
 *    { ok:false } rather than propagating — callers rely on the envelope alone,
 *  - a { fromEmail, fromName } override is placed on the Brevo `sender` envelope
 *    (this is how the signing routes send from the validated Springboard sender).
 */
describe("sendBrevoEmail", () => {
  const savedKey = process.env.BREVO_API_KEY;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.BREVO_API_KEY = "test-key";
  });

  afterEach(() => {
    if (savedKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = savedKey;
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  const base = {
    to: [{ email: "signer@example.com" }],
    subject: "Please sign",
    html: "<p>hi</p>",
  };

  it("returns ok:false (not a throw) when Brevo rejects with a non-2xx", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response("sender not valid", { status: 400 }),
    ) as unknown as typeof fetch;

    const res = await sendBrevoEmail(base);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("Brevo 400");
  });

  it("returns ok:false (not a throw) when the fetch itself rejects", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const res = await sendBrevoEmail(base);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("network down");
  });

  it("uses the fromEmail/fromName override on the sender envelope", async () => {
    let capturedBody = "";
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      capturedBody = (init?.body as string) ?? "";
      return new Response(JSON.stringify({ messageId: "abc" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const res = await sendBrevoEmail({
      ...base,
      fromEmail: "hello@springboardhomes.com.au",
      fromName: "Springboard Homes",
    });

    expect(res.ok).toBe(true);
    const body = JSON.parse(capturedBody);
    expect(body.sender).toEqual({ email: "hello@springboardhomes.com.au", name: "Springboard Homes" });
  });
});
