/**
 * Shared by the /api/sales routes. STAFF only (Cloudflare Access) — the
 * partner portal reads its own deals through /api/partner and never sees
 * these columns' internal fields (staff_notes, sale_owner, etc).
 */
import { supabase } from "../../../utils/supabase";
import { SALE_FIELDS, type SalePayment } from "../../../utils/sales";

export const SALE_COLUMNS = [
  "id", "partner_id", "client_id", "property_id", "stage", "stage_updated_at",
  "lot_summary", "price_snapshot", "referral_fee_snapshot", "hold_expires_at",
  "opportunity_id", "partner_note", "message_to_partner", "decision_reason",
  "created_at", "updated_at",
  "external_stage", "external_synced_at",
  ...Object.keys(SALE_FIELDS),
].join(",");

export const SALE_SELECT = `${SALE_COLUMNS},partners(firm_name),partner_clients(first_name,last_name,email,phone)`;

/** Postgres/PostgREST errors that mean the migration hasn't been run. */
export function saleColumnsMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42703" || // undefined column
    error.code === "42P01" || // undefined table
    error.code === "PGRST204" ||
    /column .* does not exist|relation .* does not exist|Could not find/i.test(error.message ?? "")
  );
}

export async function loadPayments(dealIds: string[]): Promise<Map<string, SalePayment[]>> {
  const out = new Map<string, SalePayment[]>();
  if (!dealIds.length) return out;
  const { data } = await supabase
    .from("deal_payments")
    .select("id,deal_id,kind,amount,received_on,method,reference,note,created_by,created_at")
    .in("deal_id", dealIds)
    .order("received_on", { ascending: true });
  for (const row of (data ?? []) as (SalePayment & { deal_id: string })[]) {
    const list = out.get(row.deal_id) ?? [];
    list.push({ ...row, amount: Number(row.amount) });
    out.set(row.deal_id, list);
  }
  return out;
}

/** Brisbane calendar date, YYYY-MM-DD. */
export function brisbaneDate(d = new Date()): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
}

/** Append to the deal's audit trail. Never throws — the audit must not block the sale. */
export async function logSaleEvent(
  deal: { id: string; partner_id: string | null; client_id: string | null },
  actor: string,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.from("partner_events").insert({
      partner_id: deal.partner_id,
      enquiry_id: deal.id,
      client_id: deal.client_id,
      actor_type: "staff",
      actor,
      action,
      detail,
    });
  } catch {
    /* audit is best-effort */
  }
}
