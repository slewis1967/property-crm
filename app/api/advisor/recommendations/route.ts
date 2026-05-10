/**
 * GET /api/advisor/recommendations?status=pending&limit=50
 *
 * Lists Veteran Advisor recommendations.
 * Default status filter: 'pending'. Pass status=all to get every state.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);

  // For 'pending' include snoozed items whose snooze has expired
  let query = supabase
    .from("recommendation_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "pending") {
    // pending OR snoozed-and-expired
    query = query.or(
      `status.eq.pending,and(status.eq.snoozed,snoozed_until.lt.${new Date().toISOString()})`,
    );
  } else if (status === "senior_deferred") {
    // Recs the Senior Advisor flagged for Sean's call. Limit to ones
    // still actionable so the tab is a live to-do, not a history view.
    query = query
      .eq("senior_status", "deferred")
      .in("status", ["pending", "in_progress", "snoozed"]);
  } else if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}
