import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest, isUnauthenticated } from "../../../../utils/cf-access";

export const dynamic = "force-dynamic";

/** GET — the list of builders/developers to pick a deal supplier from:
 *  active builders (canonical_name) merged with any supplier already used on a
 *  deal, deduped + sorted. Best-effort — a missing table just yields fewer names. */
export async function GET(req: Request) {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const set = new Set<string>();

  try {
    const { data } = await supabase.from("builders").select("canonical_name").eq("active", true).limit(2000);
    (data as { canonical_name?: string | null }[] | null ?? []).forEach((b) => {
      const n = (b.canonical_name ?? "").trim();
      if (n) set.add(n);
    });
  } catch { /* builders table absent — skip */ }

  try {
    const { data } = await supabase.from("revenue_deals").select("supplier").limit(2000);
    (data as { supplier?: string | null }[] | null ?? []).forEach((r) => {
      const n = (r.supplier ?? "").trim();
      if (n) set.add(n);
    });
  } catch { /* supplier column not migrated — skip */ }

  const suppliers = [...set].sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ ok: true, suppliers });
}
