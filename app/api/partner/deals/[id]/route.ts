/**
 * GET  /api/partner/deals/<id>                        — one deal
 * POST /api/partner/deals/<id>  { action: "withdraw" } — withdraw a request we haven't acted on
 *
 * PUBLIC (session-scoped). Loaded through loadOwnDeal: another firm's deal is a
 * 404 like one that doesn't exist.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { partnerMayWithdraw } from "../../../../../utils/partner";
import {
  DEAL_COLUMNS,
  loadOwnDeal,
  logPartnerEvent,
  readJson,
  requireFeature,
  requirePartner,
  showsFees,
  toDealView,
  type DealRow,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "deals");
  if (locked) return locked;

  const { id } = await params;
  const deal = await loadOwnDeal(auth, id);
  if (!deal) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, deal: toDealView(deal, { showFees: showsFees(auth) }) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "deals");
  if (locked) return locked;

  const { id } = await params;
  const deal = await loadOwnDeal(auth, id);
  if (!deal) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "withdraw") return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });

  // Once a hold is granted, NextKey has committed to the builder on the
  // partner's behalf, so releasing it is a conversation, not a button.
  if (!partnerMayWithdraw(deal.stage)) {
    return NextResponse.json(
      { ok: false, error: "This lot is already on hold for your client. Contact NextKey to release it." },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("partner_enquiries")
    .update({ stage: "withdrawn", stage_updated_at: now, updated_at: now })
    .eq("id", id)
    .eq("partner_id", auth.partnerId)
    .eq("stage", "requested") // lose the race to a staff approval cleanly
    .select(DEAL_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: "Could not withdraw the request." }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "NextKey has just acted on this request. Refresh to see where it's up to." },
      { status: 409 },
    );
  }

  await logPartnerEvent({
    partnerId: auth.partnerId,
    enquiryId: id,
    clientId: deal.client_id,
    actorType: "partner",
    actor: auth.email,
    action: "request_withdrawn",
  });
  return NextResponse.json({ ok: true, deal: toDealView(data as unknown as DealRow, { showFees: showsFees(auth) }) });
}
