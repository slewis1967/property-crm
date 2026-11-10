/**
 * GET  /api/partner/deals  — this firm's deals, newest activity first
 * POST /api/partner/deals  — request a hold: { property_id, client_id, note? }
 *
 * PUBLIC (session-scoped).
 *
 * A request is only a request. Nothing is held, and nothing about the supplier
 * is released, until NextKey confirms with the builder and grants it from
 * /admin/partners. The internal notice names the supplier so whoever picks it
 * up can make that call; the partner's copy never does.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { formatAud } from "../../../../utils/partner";
import { loadPartnerLot, lotLabel, lotSupplierForStaff } from "../../../../utils/partner-stock";
import { partnerNotifyRecipients, sendHoldRequestNotice } from "../../../../utils/partner-email";
import {
  DEAL_COLUMNS,
  listOwnDeals,
  loadOwnClient,
  logPartnerEvent,
  readJson,
  requireFeature,
  requirePartner,
  showsFees,
  toDealView,
  type DealRow,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "deals");
  if (locked) return locked;

  const rows = await listOwnDeals(auth);
  const fees = showsFees(auth);
  return NextResponse.json({ ok: true, deals: rows.map((d) => toDealView(d, { showFees: fees })) });
}

export async function POST(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "deals");
  if (locked) return locked;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const client = await loadOwnClient(auth, String(body.client_id ?? ""));
  if (!client) return NextResponse.json({ ok: false, error: "Choose one of your clients." }, { status: 400 });
  if (client.status !== "active") {
    return NextResponse.json({ ok: false, error: "That client is archived. Restore them first." }, { status: 409 });
  }

  // Fees are loaded for the snapshot whatever the tier: the figure is the
  // partner's own, and toDealView decides whether their plan shows it.
  const lot = await loadPartnerLot(String(body.property_id ?? ""), { showFees: true });
  if (!lot) return NextResponse.json({ ok: false, error: "That lot wasn't found." }, { status: 404 });
  if (lot.availability !== "available") {
    return NextResponse.json(
      {
        ok: false,
        error: lot.availability === "on_hold" ? "That lot is already on hold." : "That lot is no longer available.",
      },
      { status: 409 },
    );
  }

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) || null : null;
  // The snapshot is the masked lot, minus the moving parts that belong on the
  // deal itself (the fee has its own column; availability and freshness change).
  const referralFee = lot.referralFee;
  const lotSummary: Partial<typeof lot> = { ...lot };
  delete lotSummary.referralFee;
  delete lotSummary.availability;
  delete lotSummary.updatedAt;

  const { data, error } = await supabase
    .from("partner_enquiries")
    .insert({
      partner_id: auth.partnerId,
      client_id: client.id,
      property_id: lot.id,
      created_by_user_id: auth.userId,
      stage: "requested",
      partner_note: note,
      lot_summary: lotSummary,
      price_snapshot: lot.price,
      referral_fee_snapshot: referralFee,
    })
    .select(DEAL_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "You've already asked for this lot for this client." },
        { status: 409 },
      );
    }
    console.error("[partner] deal insert failed", error.message);
    return NextResponse.json({ ok: false, error: "Could not send the request. Please try again." }, { status: 500 });
  }
  const deal = data as unknown as DealRow;

  await logPartnerEvent({
    partnerId: auth.partnerId,
    enquiryId: deal.id,
    clientId: client.id,
    actorType: "partner",
    actor: auth.email,
    action: "hold_requested",
    detail: { property_id: lot.id, lot_ref: lot.ref },
  });

  // Best-effort — the request is already in the staff queue whether or not
  // this sends — but AWAITED: Netlify can freeze a function once its response
  // is returned, and a fire-and-forget send would then vanish silently.
  const supplier = await lotSupplierForStaff(lot.id);
  const notice = await sendHoldRequestNotice({
    to: partnerNotifyRecipients(),
    firmName: auth.firmName,
    requestedBy: auth.fullName ?? auth.email,
    clientName: [client.first_name, client.last_name].filter(Boolean).join(" "),
    lotRef: lot.ref,
    lotLabel: `${lotLabel(lot)} — ${formatAud(lot.price)}`,
    supplier:
      [supplier.builder_name, supplier.estate_name, supplier.lot_number && `Lot ${supplier.lot_number}`]
        .filter(Boolean)
        .join(" · ") || "unknown — check the stock record",
    partnerNote: note,
  }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
  if (!notice.ok) console.error("[partner] hold-request notice not sent", { deal: deal.id, error: notice.error });

  return NextResponse.json({ ok: true, deal: toDealView(deal, { showFees: showsFees(auth) }) }, { status: 201 });
}
