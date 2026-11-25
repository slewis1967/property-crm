/**
 * GET  /api/sales?stage=open|all|<stage>&format=csv
 *   Every deal — NextKey's direct sales and partner deals — as sale records,
 *   with the deposit position and the computed next step.
 *
 * POST /api/sales
 *   Create a DIRECT sale (no partner). Body: any SALE_FIELDS plus optional
 *   property_id (global_stock_pool.id) and opportunity_id. Starts at 'requested'
 *   ("New"); pass stage: "hold" to record it straight in as Reserved.
 *
 * STAFF only (Cloudflare Access).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireStaff, readJson } from "../admin/introducers/_shared";
import { depositPosition, isLiveSale, nextStep, parseSaleUpdate, SALE_MIGRATION_HINT, saleStageLabel } from "../../../utils/sales";
import { brisbaneDate, loadPayments, logSaleEvent, SALE_SELECT, saleColumnsMissing } from "./_shared";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown> & { id: string; stage: string; partner_id: string | null; client_id: string | null };

function one<T>(v: unknown): T | null {
  return (Array.isArray(v) ? v[0] : v) as T | null;
}

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const stage = params.get("stage") ?? "open";

  let q = supabase.from("partner_enquiries").select(SALE_SELECT);
  if (stage !== "all" && stage !== "open") q = q.eq("stage", stage);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1000);
  if (saleColumnsMissing(error)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let rows = (data ?? []) as unknown as Row[];
  if (stage === "open") rows = rows.filter((r) => isLiveSale(r.stage));

  const payments = await loadPayments(rows.map((r) => r.id));
  const today = brisbaneDate();
  const sales = rows.map((r) => {
    const deposit = depositPosition(r as never, payments.get(r.id) ?? []);
    const lot = (r.lot_summary ?? {}) as Record<string, unknown>;
    const client = one<{ first_name?: string; last_name?: string }>(r.partner_clients);
    const partner = one<{ firm_name?: string }>(r.partners);
    return {
      id: r.id,
      sale_ref: (r.sale_ref as string) || (lot.ref as string) || (lot.lot_number ? `Lot ${lot.lot_number}` : null),
      project_name: (r.project_name as string) || (lot.estate_name as string) || [lot.suburb, lot.state].filter(Boolean).join(", ") || null,
      developer_name: r.developer_name ?? null,
      unit_no: r.unit_no ?? null,
      buyer: (r.buyer_names as string) || [client?.first_name, client?.last_name].filter(Boolean).join(" ") || null,
      partner: partner?.firm_name ?? null,
      stage: r.stage,
      stage_label: saleStageLabel(r.stage),
      price: Number(r.sale_price ?? r.price_snapshot ?? 0) || null,
      owner: r.sale_owner ?? null,
      deposit,
      next_step: nextStep(r as never, deposit, today),
      external_stage: r.external_stage ?? null,
      updated_at: r.updated_at,
    };
  });

  if (params.get("format") === "csv") {
    const cols = ["sale_ref", "project_name", "unit_no", "buyer", "partner", "stage_label", "price", "deposit_received", "next_step", "owner", "updated_at"];
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      // Neutralise spreadsheet formulas as well as quoting.
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    };
    const lines = [cols.join(",")].concat(
      sales.map((s) =>
        [s.sale_ref, s.project_name, s.unit_no, s.buyer, s.partner, s.stage_label, s.price, s.deposit.totalReceived, s.next_step?.label, s.owner, s.updated_at]
          .map(esc)
          .join(","),
      ),
    );
    return new NextResponse(lines.join("\n"), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="sales-${brisbaneDate()}.csv"` },
    });
  }

  return NextResponse.json({ ok: true, sales });
}

export async function POST(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = parseSaleUpdate(body);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const fields = parsed.update;
  if (!fields.sale_ref && !fields.project_name) {
    return NextResponse.json({ ok: false, error: "Give the sale a lot reference or a project." }, { status: 400 });
  }

  const stage = body.stage === "hold" ? "hold" : "requested";
  const propertyId = typeof body.property_id === "string" && /^[0-9a-f-]{36}$/i.test(body.property_id) ? body.property_id : null;
  const opportunityId = typeof body.opportunity_id === "string" && body.opportunity_id ? body.opportunity_id.slice(0, 100) : null;

  // Snapshot the stock row so the sale stays legible if the feed drops it.
  let lotSummary: Record<string, unknown> = {};
  if (propertyId) {
    const { data: lot } = await supabase
      .from("global_stock_pool")
      .select("id,builder_name,estate_name,lot_number,street_address,suburb,state,total_package_price")
      .eq("id", propertyId)
      .maybeSingle();
    if (!lot) return NextResponse.json({ ok: false, error: "That property isn't in stock." }, { status: 404 });
    lotSummary = { ...lot, captured_at: new Date().toISOString() };
    fields.developer_name ??= lot.builder_name ?? null;
    fields.project_name ??= lot.estate_name ?? null;
    fields.sale_price ??= lot.total_package_price ?? null;
    fields.sale_ref ??= lot.lot_number ? `Lot ${lot.lot_number}` : null;
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("partner_enquiries")
    .insert({
      ...fields,
      partner_id: null,
      client_id: null,
      property_id: propertyId,
      opportunity_id: opportunityId,
      lot_summary: lotSummary,
      price_snapshot: fields.sale_price ?? null,
      stage,
      stage_updated_at: now,
      sale_owner: fields.sale_owner ?? auth,
      decided_by: stage === "hold" ? auth : null,
    })
    .select("id,partner_id,client_id")
    .single();
  if (saleColumnsMissing(error)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (error?.code === "23505") {
    return NextResponse.json({ ok: false, error: "That lot is already held by another live deal." }, { status: 409 });
  }
  if (error || !data) return NextResponse.json({ ok: false, error: error?.message ?? "Insert failed" }, { status: 500 });

  await logSaleEvent(data, auth, "sale_created", { stage, property_id: propertyId });
  return NextResponse.json({ ok: true, id: data.id });
}
