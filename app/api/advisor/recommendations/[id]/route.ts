/**
 * POST /api/advisor/recommendations/{id}
 *   Body: { action: "apply" | "dismiss" | "snooze", reason?: string, snooze_days?: number }
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const update: Record<string, any> = {};
  const now = new Date().toISOString();

  if (action === "apply") {
    update.status = "applied";
    update.applied_at = now;
    update.applied_by = body.applied_by ?? "advisor";
  } else if (action === "dismiss") {
    update.status = "dismissed";
    update.dismissed_at = now;
    update.dismissed_reason = body.reason ?? "no reason given";
  } else if (action === "snooze") {
    const days = Math.max(1, Math.min(parseInt(body.snooze_days ?? 7, 10), 90));
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    update.status = "snoozed";
    update.snoozed_until = until;
  } else {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("recommendation_log")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recommendation: data });
}
