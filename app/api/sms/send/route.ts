/**
 * Single-SMS send endpoint.
 *
 * POST { contactId?, phone?, body, campaign? }
 *
 * Either contactId or phone must be provided. If contactId is given we look up
 * the contact's phone and convert to E.164. Body is sent as-is — caller is
 * responsible for including any sender id / STOP line / personalization.
 *
 * Use this from the UI for one-off sends. The bulk blast script in
 * scripts/blast_getahome.ts calls sendSms() directly to avoid HTTP overhead.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { sendSms, toE164AU } from "../../../../utils/sms";
import { requireAuth } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";
import { errMessage } from "../../../../utils/errors";
export const dynamic = "force-dynamic";

async function handler(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const text: string | undefined = body.body;
    const campaign: string | undefined = body.campaign;
    if (!text || !text.trim()) {
      return NextResponse.json({ ok: false, error: "body is required" }, { status: 400 });
    }

    let phone: string | null = null;
    const contactId: string | null = body.contactId ?? null;

    if (body.phone) {
      phone = toE164AU(body.phone);
    } else if (contactId) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("phone")
        .eq("id", contactId)
        .maybeSingle();
      if (!contact) {
        return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
      }
      phone = toE164AU(contact.phone);
    }

    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "No valid AU mobile number resolved" },
        { status: 400 },
      );
    }

    const result = await sendSms({ contactId, phone, body: text, campaign });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      provider_msg_id: result.provider_msg_id,
      cost: result.cost,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: errMessage(e, "Failed to send") },
      { status: 500 },
    );
  }
}

export const POST = withObservability("POST /api/sms/send", handler);
