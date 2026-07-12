/**
 * ClickSend SMS sender.
 *
 * Single source of truth for outbound SMS. Both the /api/sms/send route and
 * the bulk blast script call into here so behaviour stays identical between
 * one-off sends from the UI and scheduled blasts.
 *
 * Cost-per-message and provider message id are returned by ClickSend on the
 * success response — we record both in sms_log for billing reconciliation.
 */
import { supabase } from "./supabase";
import { errMessage } from "./errors";

const CLICKSEND_BASE = "https://rest.clicksend.com/v3";
// Glenn Mayes' verified mobile number. Replies route back through ClickSend
// to this number so YES/STOP replies show up on Glenn's actual phone.
// Verified APPROVED in ClickSend account on 2026-05-01.
const SENDER = "+61488161674";

export type SmsResult =
  | { ok: true; provider_msg_id: string; cost: number; status: string }
  | { ok: false; error: string };

/** Convert AU mobile to E.164. Returns null if not a valid AU mobile. */
export function toE164AU(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+61") && digits.length === 12) return digits;
  if (digits.startsWith("61") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  return null;
}

/** Has this phone opted out? */
export async function isOptedOut(phone: string): Promise<boolean> {
  const { data } = await supabase
    .from("sms_opt_outs")
    .select("phone")
    .eq("phone", phone)
    .maybeSingle();
  return !!data;
}

/** Send one SMS via ClickSend. Writes sms_log row regardless of outcome. */
export async function sendSms(opts: {
  contactId?: string | null;
  phone: string; // E.164
  body: string;
  campaign?: string;
}): Promise<SmsResult> {
  const username = process.env.CLICKSEND_USERNAME;
  const apiKey = process.env.CLICKSEND_API_KEY;
  if (!username || !apiKey) {
    return { ok: false, error: "ClickSend credentials not configured" };
  }

  // Skip if opted out — record the attempt for audit but don't hit provider.
  if (await isOptedOut(opts.phone)) {
    await supabase.from("sms_log").insert({
      contact_id: opts.contactId ?? null,
      phone: opts.phone,
      body: opts.body,
      status: "opted_out",
      campaign: opts.campaign ?? null,
    });
    return { ok: false, error: "Recipient has opted out" };
  }

  const auth = Buffer.from(`${username}:${apiKey}`).toString("base64");
  const payload = {
    messages: [
      {
        source: "nextkey-crm",
        from: SENDER,
        to: opts.phone,
        body: opts.body,
      },
    ],
  };

  let providerMsgId: string | null = null;
  let cost: number | null = null;
  let providerStatus: string | null = null;
  let errMsg: string | null = null;

  try {
    const res = await fetch(`${CLICKSEND_BASE}/sms/send`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    const msg = json?.data?.messages?.[0];
    if (msg && msg.status === "SUCCESS") {
      providerMsgId = msg.message_id ?? null;
      cost = typeof msg.message_price === "string" ? parseFloat(msg.message_price) : (msg.message_price ?? null);
      providerStatus = msg.status;
    } else {
      errMsg =
        msg?.status_text ||
        msg?.status ||
        json?.response_msg ||
        `HTTP ${res.status}`;
    }
  } catch (e) {
    errMsg = errMessage(e, "Network error");
  }

  await supabase.from("sms_log").insert({
    contact_id: opts.contactId ?? null,
    phone: opts.phone,
    body: opts.body,
    status: errMsg ? "failed" : "sent",
    provider_msg_id: providerMsgId,
    error: errMsg,
    campaign: opts.campaign ?? null,
    cost,
  });

  if (errMsg) return { ok: false, error: errMsg };
  return {
    ok: true,
    provider_msg_id: providerMsgId!,
    cost: cost ?? 0,
    status: providerStatus ?? "sent",
  };
}
