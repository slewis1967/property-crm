/** Server-only reads and writes shared by the invoice routes. */

import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import { type Invoice, type InvoiceSettings, coerceLines, invoicesTableMissing } from "./invoices";

export function asInvoice(row: Record<string, unknown>): Invoice {
  return {
    ...(row as unknown as Invoice),
    lines: coerceLines(row.lines),
    subtotal_cents: Number(row.subtotal_cents ?? 0),
    gst_cents: Number(row.gst_cents ?? 0),
    total_cents: Number(row.total_cents ?? 0),
    amount_paid_cents: Number(row.amount_paid_cents ?? 0),
  };
}

export async function loadInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? asInvoice(data as Record<string, unknown>) : null;
}

export async function loadSettings(): Promise<InvoiceSettings> {
  const { data, error } = await supabase.from("invoice_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data as InvoiceSettings;
}

/**
 * The audit trail. Best-effort: the invoice change has already happened, so a
 * failed log line is reported in the server log, not returned as a failed save.
 */
export async function logInvoiceEvent(
  invoiceId: string,
  action: string,
  actor: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from("invoice_events")
    .insert({ invoice_id: invoiceId, action, actor, detail: detail ?? null });
  if (error) log.error("invoices.event_failed", { invoiceId, action, ...errInfo(error) });
}

export { invoicesTableMissing };
