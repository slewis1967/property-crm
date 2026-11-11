/**
 * POST /api/calls/dial { phone, contactId?, opportunityId? }
 *   Queues a call on Glenn's work phone (0477 201 245). The relay with adb
 *   access to the handset claims it and starts the call. Returns { id }.
 * GET /api/calls/dial?id=<uuid>
 *   The request's status, for the button to poll.
 * See utils/work-phone-dial.ts.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { errMessage } from "../../../../utils/errors";
import { dialStatusFor, dialableAU } from "../../../../utils/work-phone-dial";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const phone = dialableAU(typeof body.phone === "string" ? body.phone : null);
    if (!phone) {
      return NextResponse.json(
        { ok: false, error: "Not an Australian mobile or landline the work phone can call." },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("phone_call_requests")
      .insert({
        phone,
        contact_id: typeof body.contactId === "string" ? body.contactId : null,
        opportunity_id: typeof body.opportunityId === "string" ? body.opportunityId : null,
        requested_by: auth,
      })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Could not queue the call" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: errMessage(e, "Could not queue the call") }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  const { data, error } = await supabase
    .from("phone_call_requests")
    .select("status, created_at, error")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, ...dialStatusFor(data) });
}
