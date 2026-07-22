/**
 * Inbound-SMS webhook (ClickSend → here) for automatic STOP opt-outs.
 *
 * A Netlify Function, so ClickSend posts to the site's *.netlify.app function
 * URL directly — no Cloudflare Access to traverse. When a client texts STOP (or
 * a synonym) in reply to a document reminder, we record their number in
 * sms_opt_outs; utils/sms.ts then refuses to message them again. This makes the
 * "Reply STOP to opt out" promise real and automatic.
 *
 * Security: ClickSend must include ?key=<SMS_INBOUND_KEY> in the webhook URL.
 * Without a configured key we refuse (fail closed) so a stray public POST can't
 * write opt-outs.
 *
 * Always returns 200 to ClickSend (even on a no-op) so it doesn't retry.
 */
import { createClient } from "@supabase/supabase-js";

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT", "REMOVE"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);

function toE164AU(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+61") && digits.length === 12) return digits;
  if (digits.startsWith("61") && digits.length === 11) return "+" + digits;
  if (digits.startsWith("04") && digits.length === 10) return "+61" + digits.slice(1);
  if (digits.startsWith("4") && digits.length === 9) return "+61" + digits;
  return null;
}

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      return (await req.json()) as Record<string, string>;
    }
    // ClickSend defaults to form-encoded.
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text));
  } catch {
    return {};
  }
}

export default async (req: Request) => {
  const ok = (info: Record<string, unknown>) =>
    new Response(JSON.stringify({ ok: true, ...info }), { status: 200, headers: { "content-type": "application/json" } });

  const key = process.env.SMS_INBOUND_KEY;
  const provided = new URL(req.url).searchParams.get("key");
  if (!key || provided !== key) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorised" }), { status: 401 });
  }

  const body = await parseBody(req);
  // ClickSend inbound fields vary a little by config; accept the common aliases.
  const from = body.from || body.sender || body.originalsenderid || "";
  const message = (body.message || body.body || body.sms || body.originalmessage || "").trim();
  const phone = toE164AU(from);
  const word = message.toUpperCase().replace(/[^A-Z-]/g, "");

  if (!phone) return ok({ action: "ignored", reason: "unparseable sender" });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://unconfigured.supabase.invalid",
    process.env.SUPABASE_SERVICE_KEY || "unconfigured",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  if (STOP_WORDS.has(word)) {
    await supabase.from("sms_opt_outs").upsert({ phone, reason: "stop_reply" }, { onConflict: "phone" });
    return ok({ action: "opted_out", phone });
  }
  if (START_WORDS.has(word)) {
    await supabase.from("sms_opt_outs").delete().eq("phone", phone);
    return ok({ action: "opted_in", phone });
  }
  // A non-keyword reply (e.g. "I'm stuck on myGov") — not our job to answer;
  // ClickSend already forwards replies to Glenn's phone.
  return ok({ action: "ignored", phone });
};
