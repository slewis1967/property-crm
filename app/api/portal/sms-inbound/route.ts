/**
 * POST /api/portal/sms-inbound?key=<SMS_INBOUND_KEY>   (PUBLIC — key-gated)
 *
 * ClickSend inbound-SMS webhook for automatic STOP opt-outs. Lives under
 * /api/portal/* because that prefix is the CRM's public, Cloudflare-Access-
 * bypassed surface (see proxy.ts isPublicPortalRoute) — ClickSend, a
 * server-to-server caller with no Origin header, can reach it without a login.
 * A direct *.netlify.app function URL can't be used: the edge tunnel gate blocks
 * it. Access is instead gated by a shared secret in the query string.
 *
 * When a client texts STOP (or a synonym) in reply to a document reminder we
 * record their number in sms_opt_outs; utils/sms.ts then refuses to message
 * them again. START/YES removes the opt-out. Always 200 so ClickSend doesn't
 * retry. Never uses requireAuth — this route is intentionally unauthenticated
 * and protected only by the key.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { toE164AU } from "../../../../utils/sms";
import { replyKeyword } from "../../../../utils/sms-keywords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function parseBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) return (await req.json()) as Record<string, string>;
    return Object.fromEntries(new URLSearchParams(await req.text()));
  } catch {
    return {};
  }
}

export async function POST(req: Request) {
  const key = process.env.SMS_INBOUND_KEY;
  const provided = new URL(req.url).searchParams.get("key");
  if (!key || provided !== key) {
    return NextResponse.json({ ok: false, error: "unauthorised" }, { status: 401 });
  }

  const body = await parseBody(req);
  // ClickSend inbound field names vary slightly by config; accept the aliases.
  const from = body.from || body.sender || body.originalsenderid || "";
  const message = (body.message || body.body || body.sms || body.originalmessage || "").trim();
  const phone = toE164AU(from);
  const keyword = replyKeyword(message);

  if (!phone) return NextResponse.json({ ok: true, action: "ignored", reason: "unparseable sender" });

  if (keyword === "stop") {
    await supabase.from("sms_opt_outs").upsert({ phone, reason: "stop_reply" }, { onConflict: "phone" });
    return NextResponse.json({ ok: true, action: "opted_out", phone });
  }
  if (keyword === "start") {
    await supabase.from("sms_opt_outs").delete().eq("phone", phone);
    return NextResponse.json({ ok: true, action: "opted_in", phone });
  }
  // Any other reply (e.g. "I'm stuck on myGov") — ClickSend still forwards it to
  // Glenn's phone; nothing for us to do here.
  return NextResponse.json({ ok: true, action: "ignored", phone });
}
