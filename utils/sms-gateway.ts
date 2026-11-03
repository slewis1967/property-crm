/**
 * The work phone as an SMS gateway (SMS Gateway for Android, sms-gate.app).
 *
 * Why: clients answer a number they recognise, so every CRM text has to come
 * from Glenn's work mobile itself (0477 201 245), not a ClickSend number. The
 * phone runs SMS Gateway for Android in Cloud mode: the CRM posts to the cloud
 * API, the phone sends from its own SIM, and the phone posts replies and
 * delivery receipts back to /api/portal/sms-gateway.
 *
 * Message text passes through api.sms-gate.app (end-to-end encryption is
 * optional in the app and not configured). Never put a TFN, licence number or
 * bank details in an SMS body.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SMS_GATEWAY_BASE = (process.env.SMSGATE_BASE_URL?.trim() || "https://api.sms-gate.app").replace(/\/+$/, "");

/** How far a webhook timestamp may drift before we reject it (replay guard). */
export const MAX_SKEW_SECONDS = 300;

/** True when outbound SMS should go out through the work phone instead of ClickSend. */
export function phoneGatewayEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.SMS_PROVIDER || "").trim().toLowerCase() === "phone";
}

/**
 * Verify an sms-gate.app webhook: HMAC-SHA256 over the raw body with the
 * X-Timestamp value appended, hex-encoded in X-Signature. Must be given the
 * body exactly as received (never re-serialised JSON).
 */
export function verifyGatewaySignature(opts: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  key: string;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { rawBody, signature, timestamp, key } = opts;
  if (!key) return { ok: false, reason: "signing key not configured" };
  if (!signature || !timestamp) return { ok: false, reason: "missing signature headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "bad timestamp" };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale timestamp" };

  const expected = createHmac("sha256", key).update(rawBody + timestamp).digest("hex");
  const given = signature.trim().toLowerCase();
  if (given.length !== expected.length || !/^[0-9a-f]+$/.test(given)) return { ok: false, reason: "bad signature" };
  if (!timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"))) {
    return { ok: false, reason: "bad signature" };
  }
  return { ok: true };
}

export type GatewaySend = { ok: true; id: string; state: string } | { ok: false; error: string };

/** Queue one text on the phone. The phone sends it asynchronously; the outcome arrives by webhook. */
export async function sendViaPhoneGateway(phone: string, body: string): Promise<GatewaySend> {
  const user = process.env.SMSGATE_USERNAME?.trim();
  const pass = process.env.SMSGATE_PASSWORD?.trim();
  if (!user || !pass) return { ok: false, error: "SMS gateway credentials not configured" };

  const res = await fetch(`${SMS_GATEWAY_BASE}/3rdparty/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textMessage: { text: body },
      phoneNumbers: [phone],
      withDeliveryReport: true,
    }),
  });
  let json: { id?: string; state?: string; message?: string } = {};
  try {
    json = await res.json();
  } catch {
    // non-JSON error page
  }
  if (!res.ok || !json.id) return { ok: false, error: json.message || `Gateway HTTP ${res.status}` };
  return { ok: true, id: json.id, state: json.state || "Pending" };
}

/** sms-gate.app delivery events → our sms_log.status vocabulary. */
export const GATEWAY_STATUS: Record<string, string> = {
  "sms:sent": "sent",
  "sms:delivered": "delivered",
  "sms:failed": "failed",
  "sms:cancelled": "failed",
};

/**
 * Client SMS text, made safe to append to contacts.notes. Notes are a staff
 * record that people and the CRM's AI read as "what we know", made of
 * "[date · source]" entries. A client's text must never pass as one of those,
 * so every line is quoted with "> " (a client cannot start a line with "[")
 * and the whole thing is capped.
 */
export function quoteClientText(text: string, max = 2000): string {
  return text
    // Every Unicode line terminator becomes \n, so no reader sees a line we didn't quote.
    .replace(/\r\n?|[  \u0085\u000B\u000C]/g, "\n")
    // Drop other control characters and bidi overrides, which can disguise text.
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "")
    .slice(0, max)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}
