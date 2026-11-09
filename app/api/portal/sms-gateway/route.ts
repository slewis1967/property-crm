/**
 * POST /api/portal/sms-gateway   (PUBLIC — HMAC-signed)
 *
 * Webhook for the work phone's SMS gateway (utils/sms-gateway.ts). The phone
 * posts here when a client texts it (sms:received) and when a text the CRM
 * queued is sent / delivered / fails.
 *
 * Under /api/portal/* because that is the CRM's Cloudflare-Access-bypassed
 * surface (proxy.ts isPublicPortalRoute); the phone has no Access identity.
 * Authenticity is the gateway's HMAC-SHA256 signature (X-Signature over raw
 * body + X-Timestamp, key = SMSGATE_SIGNING_KEY), not a query-string secret.
 *
 * A received text is logged to sms_log (status "received"), appended to the
 * matching contact's notes, and STOP/START update sms_opt_outs. Answers 200
 * for anything signed, including events we ignore, so the phone doesn't retry
 * for two days.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { toE164AU } from "../../../../utils/sms";
import { replyKeyword } from "../../../../utils/sms-keywords";
import { GATEWAY_STATUS, quoteClientText, verifyGatewaySignature } from "../../../../utils/sms-gateway";
import { formatDateTime } from "../../../../utils/datetime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


type GatewayEvent = {
  event?: string;
  payload?: {
    messageId?: string;
    message?: string;
    sender?: string;
    reason?: string;
    receivedAt?: string;
  };
};

/**
 * Contacts hold phone numbers in any format ("0412 345 678", "+61412345678").
 * Narrow with a loose digit pattern, then confirm an exact E.164 match in code
 * so "0412 345 678" never matches someone whose number merely contains those digits.
 */
async function findContactByPhone(e164: string): Promise<{ id: string; notes: string | null } | null> {
  const local = e164.slice(3); // +61412345678 -> 412345678
  const pattern = `%${local.split("").join("%")}%`;
  const { data } = await supabase.from("contacts").select("id,phone,notes").ilike("phone", pattern).limit(20);
  const hit = (data ?? []).find((c: { phone: string | null }) => toE164AU(c.phone) === e164);
  return hit ? { id: hit.id, notes: hit.notes } : null;
}

async function appendNote(contact: { id: string; notes: string | null }, text: string) {
  const entry = `[${formatDateTime(new Date())} · SMS from client]\n${quoteClientText(text)}`;
  const notes = contact.notes ? `${contact.notes}\n\n${entry}` : entry;
  await supabase.from("contacts").update({ notes, updated_at: new Date().toISOString() }).eq("id", contact.id);
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const check = verifyGatewaySignature({
    rawBody,
    signature: req.headers.get("x-signature"),
    timestamp: req.headers.get("x-timestamp"),
    key: process.env.SMSGATE_SIGNING_KEY?.trim() || "",
  });
  if (!check.ok) {
    console.warn(`[sms-gateway] rejected webhook: ${check.reason}`);
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  let evt: GatewayEvent;
  try {
    evt = JSON.parse(rawBody) as GatewayEvent;
  } catch {
    return NextResponse.json({ ok: true, action: "ignored", reason: "bad json" });
  }
  const p = evt.payload ?? {};

  // Delivery receipts for texts the CRM queued.
  const status = evt.event ? GATEWAY_STATUS[evt.event] : undefined;
  if (status) {
    if (p.messageId) {
      await supabase
        .from("sms_log")
        .update({ status, error: status === "failed" ? p.reason || "failed on phone" : null })
        .eq("provider", "phone")
        .eq("provider_msg_id", p.messageId);
    }
    return NextResponse.json({ ok: true, action: "status", status });
  }

  if (evt.event !== "sms:received") return NextResponse.json({ ok: true, action: "ignored", event: evt.event });

  const phone = toE164AU(p.sender);
  const message = (p.message || "").trim();
  if (!phone || !message) return NextResponse.json({ ok: true, action: "ignored", reason: "no sender or text" });

  const contact = await findContactByPhone(phone);
  await supabase.from("sms_log").insert({
    contact_id: contact?.id ?? null,
    phone,
    body: message,
    status: "received",
    provider: "phone",
    provider_msg_id: p.messageId ?? null,
    campaign: "inbound",
    cost: 0,
  });
  if (contact) await appendNote(contact, message);

  const keyword = replyKeyword(message);
  if (keyword === "stop") {
    await supabase
      .from("sms_opt_outs")
      .upsert({ phone, contact_id: contact?.id ?? null, reason: "stop_reply" }, { onConflict: "phone" });
  } else if (keyword === "start") {
    await supabase.from("sms_opt_outs").delete().eq("phone", phone);
  }

  return NextResponse.json({ ok: true, action: keyword ?? "logged", matched: !!contact });
}
