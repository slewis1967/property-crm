/**
 * GET   /api/sales/<id>   the sale, its payments, files (with short-lived download links)
 * PATCH /api/sales/<id>   edit any SALE_FIELDS
 * POST  /api/sales/<id>   { action: "stage", to, reason? }   DIRECT sales only
 *
 * Partner deals move stage through /api/admin/partners/deals/<id>, which tells
 * the partner; this route refuses them so no move can skip that notice.
 *
 * STAFF only (Cloudflare Access).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireStaff, readJson } from "../../admin/introducers/_shared";
import {
  depositPosition,
  directSaleNextStages,
  LOST_STAGES,
  nextStep,
  parseSaleUpdate,
  SALE_FILES_BUCKET,
  SALE_MIGRATION_HINT,
} from "../../../../utils/sales";
import { isDealStage } from "../../../../utils/partner";
import { brisbaneDate, loadPayments, logSaleEvent, SALE_SELECT, saleColumnsMissing } from "../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type Deal = Record<string, unknown> & { id: string; stage: string; partner_id: string | null; client_id: string | null };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { deal: null, error: null };
  const { data, error } = await supabase.from("partner_enquiries").select(SALE_SELECT).eq("id", id).maybeSingle();
  return { deal: data as unknown as Deal | null, error };
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const { deal, error } = await load(id);
  if (saleColumnsMissing(error)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!deal) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const payments = (await loadPayments([deal.id])).get(deal.id) ?? [];
  const deposit = depositPosition(deal as never, payments);

  const { data: fileRows } = await supabase
    .from("deal_files")
    .select("id,name,storage_path,size_bytes,mime_type,category,uploaded_by,created_at")
    .eq("deal_id", deal.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false });
  const files = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: signed } = await supabase.storage.from(SALE_FILES_BUCKET).createSignedUrl(f.storage_path, 600, { download: f.name });
      return { ...f, url: signed?.signedUrl ?? null };
    }),
  );

  const { data: events } = await supabase
    .from("partner_events")
    .select("actor,action,detail,created_at")
    .eq("enquiry_id", deal.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({
    ok: true,
    sale: deal,
    payments,
    deposit,
    files,
    events: events ?? [],
    next_step: nextStep(deal as never, deposit, brisbaneDate()),
    next_stages: deal.partner_id ? [] : directSaleNextStages(deal.stage),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = parseSaleUpdate(body);
  if ("error" in parsed) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  if (!Object.keys(parsed.update).length) return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });

  const { deal, error: loadErr } = await load(id);
  if (saleColumnsMissing(loadErr)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (!deal) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("partner_enquiries")
    .update({ ...parsed.update, updated_at: new Date().toISOString() })
    .eq("id", deal.id);
  if (error?.code === "23505") return NextResponse.json({ ok: false, error: "Another sale already uses that developer link." }, { status: 409 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Record which fields changed, not their values (buyer details stay out of the audit).
  await logSaleEvent(deal, auth, "sale_edited", { fields: Object.keys(parsed.update) });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  if (body.action !== "stage") return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });

  const { deal } = await load(id);
  if (!deal) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (deal.partner_id) {
    return NextResponse.json(
      { ok: false, error: "This is a partner deal; move it from Partners so the partner is told." },
      { status: 409 },
    );
  }

  const to = body.to;
  if (!isDealStage(to) || !directSaleNextStages(deal.stage).includes(to)) {
    return NextResponse.json({ ok: false, error: `Can't move a ${deal.stage} sale to ${String(to)}.` }, { status: 409 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  if (LOST_STAGES.has(to) && !reason) return NextResponse.json({ ok: false, error: "Say why the sale was lost." }, { status: 400 });

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { stage: to, stage_updated_at: now, updated_at: now, decided_by: auth };
  if (LOST_STAGES.has(to)) update.lost_reason = reason;
  if (to === "unconditional" && !deal.exchange_date) update.exchange_date = brisbaneDate();
  if (to === "settled" && !deal.settlement_date) update.settlement_date = brisbaneDate();

  // Conditional on the stage we read, so two tabs can't both move it.
  const { data, error } = await supabase
    .from("partner_enquiries")
    .update(update)
    .eq("id", deal.id)
    .eq("stage", deal.stage)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return NextResponse.json({ ok: false, error: "That lot is already held by another live deal." }, { status: 409 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Someone else just changed this sale. Refresh." }, { status: 409 });

  await logSaleEvent(deal, auth, "stage_changed", { from: deal.stage, to, reason: reason || undefined });
  return NextResponse.json({ ok: true, stage: to });
}
