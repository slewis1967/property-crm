/**
 * GET /api/admin/introducers/submissions?status=…
 *
 * STAFF. The review queue: referrals from every introducer, newest submission
 * first. Drafts are excluded unless explicitly asked for — a draft is an
 * introducer's private workspace, not something for us to read over their
 * shoulder, and nothing in it has been consented to yet.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireStaff } from "../_shared";
import { introducerTablesMissing } from "../../../../../utils/introducer";

export const dynamic = "force-dynamic";

const QUEUE_STATUSES = ["submitted", "info_requested"];

export async function GET(req: Request) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const filter = url.searchParams.get("status");

  let query = supabase
    .from("introducer_clients")
    .select(
      "id,client_ref,introducer_id,first_name,last_name,email,phone,state,suburb," +
        "purchase_intent,timeframe,income_band,deposit_band,status,stage,submitted_at,updated_at," +
        "opportunity_id,introducers(firm_name)",
    )
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (filter === "all") {
    query = query.neq("status", "draft");
  } else if (filter && filter !== "queue") {
    query = query.eq("status", filter);
  } else {
    query = query.in("status", QUEUE_STATUSES);
  }

  const { data, error } = await query;
  if (introducerTablesMissing(error)) {
    return NextResponse.json(
      { ok: false, error: "Run migrations/20260811_introducer_portal.sql in the Supabase SQL editor to enable the introducer portal." },
      { status: 503 },
    );
  }
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const ids = rows.map((r) => String(r.id));

  // Which are waiting on the introducer rather than on us? Drives the "with
  // them / with us" split in the queue, so nothing sits unowned.
  const waiting = new Set<string>();
  if (ids.length > 0) {
    const { data: open } = await supabase
      .from("introducer_info_requests")
      .select("client_id")
      .in("client_id", ids)
      .eq("status", "open");
    for (const r of (open ?? []) as { client_id: string }[]) waiting.add(r.client_id);
  }

  return NextResponse.json({
    ok: true,
    submissions: rows.map((r) => {
      const firmRaw = r.introducers;
      const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as { firm_name?: string } | undefined;
      const { introducers: _drop, ...rest } = r;
      void _drop;
      return { ...rest, firm_name: firm?.firm_name ?? "—", awaiting_introducer: waiting.has(String(r.id)) };
    }),
  });
}
