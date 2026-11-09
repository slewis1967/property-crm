import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { invoiceErrMessage } from "../../../../utils/invoices";

export const dynamic = "force-dynamic";

export type BuyerOption = {
  key: string;
  source: "invoice" | "contact";
  buyer_name: string;
  buyer_email: string | null;
  buyer_abn: string | null;
  buyer_address: string | null;
  contact_id: string | null;
};

/**
 * GET ?q=: who this could be billed to. Past invoices first, because they carry
 * the ABN and address, then CRM contacts. Contacts return name and email only:
 * the contact row holds financial details this picker has no need for.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  // Strip the characters PostgREST filters treat as syntax.
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[%_,()*"\\]/g, " ").trim();
  if (q.length < 2) return NextResponse.json({ ok: true, buyers: [] });
  try {
    const [past, contacts] = await Promise.all([
      supabase
        .from("invoices")
        .select("buyer_name,buyer_email,buyer_abn,buyer_address,contact_id")
        .ilike("buyer_name", `%${q}%`)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("contacts")
        .select("id,full_name,name,email")
        .or(`full_name.ilike.%${q}%,name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8),
    ]);
    if (past.error) throw past.error;
    if (contacts.error) throw contacts.error;

    const seen = new Set<string>();
    const buyers: BuyerOption[] = [];
    for (const row of past.data ?? []) {
      const name = row.buyer_name as string | null;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      buyers.push({
        key: `invoice:${name}`,
        source: "invoice",
        buyer_name: name,
        buyer_email: row.buyer_email,
        buyer_abn: row.buyer_abn,
        buyer_address: row.buyer_address,
        contact_id: row.contact_id,
      });
    }
    for (const row of contacts.data ?? []) {
      const name = (row.full_name || row.name) as string | null;
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      buyers.push({
        key: `contact:${row.id}`,
        source: "contact",
        buyer_name: name,
        buyer_email: row.email,
        buyer_abn: null,
        buyer_address: null,
        contact_id: row.id,
      });
    }
    return NextResponse.json({ ok: true, buyers: buyers.slice(0, 10) });
  } catch (e) {
    log.error("invoices.buyers_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: invoiceErrMessage(e, "Search failed") }, { status: 500 });
  }
}
