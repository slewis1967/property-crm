/**
 * GET /api/admin/partners/deals?stage=open|all|<stage>
 *
 * STAFF (Cloudflare Access). Every firm's deals in one queue, WITH the supplier
 * behind each lot — staff need the builder to confirm a hold. This is the one
 * place partner deals and supplier identity meet, and it is behind the CF gate.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireStaff } from "../../introducers/_shared";
import { partnerTablesMissing } from "../../../../../utils/partner";
import { brisbaneToday, PAY_COLUMNS, payColumnsMissing, payOverdue, payRecordFromRow, type PayRecord } from "../../../../../utils/partner-pay";

export const dynamic = "force-dynamic";

const OPEN = ["requested", "hold", "eoi", "unconditional"];

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const stage = new URL(req.url).searchParams.get("stage") ?? "open";
  let q = supabase
    .from("partner_enquiries")
    .select(
      "id,partner_id,client_id,property_id,stage,stage_updated_at,partner_note,message_to_partner,staff_notes," +
        "lot_summary,price_snapshot,referral_fee_snapshot,revealed,revealed_at,revealed_by,hold_expires_at," +
        "decided_by,decision_reason,opportunity_id,created_at,updated_at," +
        "partners(firm_name),partner_clients(first_name,last_name,email,phone),partner_users(email,full_name)",
    );
  if (stage === "open") q = q.in("stage", OPEN);
  else if (stage !== "all") q = q.eq("stage", stage);

  const { data, error } = await q.order("updated_at", { ascending: false }).limit(500);
  if (partnerTablesMissing(error)) {
    return NextResponse.json(
      { ok: false, error: "Run migrations/20260911_partner_portal.sql in the Supabase SQL editor." },
      { status: 503 },
    );
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const deals = (data ?? []) as unknown as Record<string, unknown>[];
  const propertyIds = [...new Set(deals.map((d) => String(d.property_id)))];
  const suppliers = new Map<string, Record<string, unknown>>();
  if (propertyIds.length) {
    const { data: lots } = await supabase
      .from("global_stock_pool")
      .select("id,builder_name,estate_name,lot_number,street_address,status,pipeline_status")
      .in("id", propertyIds);
    for (const l of (lots ?? []) as Record<string, unknown>[]) suppliers.set(String(l.id), l);
  }

  // Payment records (NOVA-011) in their own query, so the queue still loads
  // before migrations/20261117f_partner_fee_payments.sql is applied.
  const pay = new Map<string, PayRecord>();
  let payMigrationMissing = false;
  let payReadError: string | null = null;
  const settledIds = deals.filter((d) => d.stage === "settled").map((d) => String(d.id));
  if (settledIds.length) {
    const { data: payRows, error: payError } = await supabase
      .from("partner_enquiries")
      .select(`id,${PAY_COLUMNS}`)
      .in("id", settledIds);
    if (payColumnsMissing(payError)) payMigrationMissing = true;
    else if (payError) {
      console.error("[admin/partners] pay records read failed", payError.message);
      payReadError = payError.message;
    }
    for (const r of (payRows ?? []) as unknown as Record<string, unknown>[]) pay.set(String(r.id), payRecordFromRow(r));
  }
  const today = brisbaneToday();

  const now = Date.now();
  return NextResponse.json({
    ok: true,
    pay_migration_missing: payMigrationMissing,
    pay_error: payReadError,
    deals: deals.map((d) => ({
      ...d,
      supplier: suppliers.get(String(d.property_id)) ?? null,
      // Holds don't lapse on their own (the lot stays tied up until staff
      // release it), so the queue flags one that has run past its date.
      hold_expired:
        d.stage === "hold" && typeof d.hold_expires_at === "string" && Date.parse(d.hold_expires_at) < now,
      payment: pay.get(String(d.id)) ?? null,
      // Staff must not edit a record that could not be read: a blank form
      // would overwrite real dates on save.
      payment_unavailable: d.stage === "settled" && (payMigrationMissing || payReadError !== null),
      payment_overdue:
        d.stage === "settled" && pay.has(String(d.id)) && payOverdue("settled", pay.get(String(d.id)) as PayRecord, today),
    })),
  });
}
