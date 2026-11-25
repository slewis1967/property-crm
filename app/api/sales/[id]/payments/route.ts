/**
 * POST   /api/sales/<id>/payments  { kind, amount, received_on, method?, reference?, note? }
 * DELETE /api/sales/<id>/payments?payment_id=<uuid>
 *
 * The deposit ledger. Recording a payment here is bookkeeping only — nothing
 * is charged or moved. STAFF only.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireStaff, readJson } from "../../../admin/introducers/_shared";
import { SALE_MIGRATION_HINT } from "../../../../../utils/sales";
import { logSaleEvent, saleColumnsMissing } from "../../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const KINDS = ["initial_deposit", "balance_deposit", "refund", "other"];

async function deal(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("partner_enquiries").select("id,partner_id,client_id").eq("id", id).maybeSingle();
  return data as { id: string; partner_id: string | null; client_id: string | null } | null;
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const d = await deal(id);
  if (!d) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const kind = String(body.kind ?? "");
  const amount = Number(String(body.amount ?? "").replace(/[$,\s]/g, ""));
  const receivedOn = String(body.received_on ?? "");
  if (!KINDS.includes(kind)) return NextResponse.json({ ok: false, error: "Pick what the payment was for." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e8) return NextResponse.json({ ok: false, error: "Enter the amount received." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return NextResponse.json({ ok: false, error: "Enter the date it was received." }, { status: 400 });
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : null);

  const { data, error } = await supabase
    .from("deal_payments")
    .insert({
      deal_id: d.id,
      kind,
      amount: Math.round(amount * 100) / 100,
      received_on: receivedOn,
      method: text(body.method),
      reference: text(body.reference),
      note: text(body.note),
      created_by: auth,
    })
    .select("id")
    .single();
  if (saleColumnsMissing(error)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await supabase.from("partner_enquiries").update({ updated_at: new Date().toISOString() }).eq("id", d.id);
  await logSaleEvent(d, auth, "payment_recorded", { kind, amount });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const paymentId = new URL(req.url).searchParams.get("payment_id") ?? "";
  const d = await deal(id);
  if (!d || !/^[0-9a-f-]{36}$/i.test(paymentId)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("deal_payments")
    .delete()
    .eq("id", paymentId)
    .eq("deal_id", d.id)
    .select("kind,amount")
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  await logSaleEvent(d, auth, "payment_removed", { kind: data.kind, amount: data.amount });
  return NextResponse.json({ ok: true });
}
