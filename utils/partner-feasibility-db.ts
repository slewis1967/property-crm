/**
 * Server-only data access for partner feasibility reports. Both the API and
 * the portal page count usage here, so they agree with the slot claim
 * (claim_partner_feasibility_slot), which counts pending + ready rows.
 */
import { supabase } from "./supabase";
import { brisbaneMonthStart } from "./partner-feasibility";

export async function feasibilityUsedThisMonth(partnerId: string): Promise<number | null> {
  const { count, error } = await supabase
    .from("partner_feasibility_reports")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", partnerId)
    .in("status", ["pending", "ready"])
    .gte("created_at", brisbaneMonthStart().toISOString());
  return error ? null : (count ?? 0);
}

/** Saved, finished reports for the firm's list. */
export async function listFeasibilityReports(partnerId: string) {
  const { data } = await supabase
    .from("partner_feasibility_reports")
    .select("id,address,title,created_at")
    .eq("partner_id", partnerId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}
