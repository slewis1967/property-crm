import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { INVOICE_MIGRATION_HINT, invoiceErrMessage, invoicesTableMissing, isValidAbn } from "../../../../utils/invoices";
import { loadSettings } from "../../../../utils/invoices-store";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ ok: true, settings: await loadSettings() });
  } catch (e) {
    if (invoicesTableMissing(e)) {
      return NextResponse.json({ ok: true, settings: null, migrationNeeded: true, hint: INVOICE_MIGRATION_HINT });
    }
    log.error("invoices.settings_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not load settings") }, { status: 500 });
  }
}

const TEXT_FIELDS = [
  "seller_name",
  "abn",
  "address",
  "email",
  "phone",
  "cc_emails",
  "bank_name",
  "bsb",
  "account_name",
  "account_number",
] as const;

export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: auth };
    for (const key of TEXT_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        row[key] = typeof b[key] === "string" && (b[key] as string).trim() ? (b[key] as string).trim() : null;
      }
    }
    if ("seller_name" in row && !row.seller_name) {
      return NextResponse.json({ ok: false, error: "The seller's name is required." }, { status: 400 });
    }
    if ("abn" in row && !isValidAbn(String(row.abn ?? ""))) {
      return NextResponse.json({ ok: false, error: "That isn't a valid ABN." }, { status: 400 });
    }
    const terms = Number(b.default_terms_days);
    if (Number.isInteger(terms) && terms >= 0 && terms <= 365) row.default_terms_days = terms;
    const next = Number(b.next_number);
    if (Number.isInteger(next) && next > 0) {
      // Numbers must not go backwards past one already used.
      const { data, error } = await supabase
        .from("invoices")
        .select("number")
        .not("number", "is", null)
        .order("number", { ascending: false })
        .limit(1);
      if (error) throw error;
      const highest = Number(data?.[0]?.number ?? 0);
      if (next <= highest) {
        return NextResponse.json({ ok: false, error: `The next number must be above ${highest}, the highest used.` }, { status: 400 });
      }
      row.next_number = next;
    }

    const { error } = await supabase.from("invoice_settings").update(row).eq("id", 1);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("invoices.settings_save_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Could not save settings") }, { status: 500 });
  }
}
