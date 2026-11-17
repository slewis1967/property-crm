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
    .in("status", ["pending", "ready", "failed"])
    .gte("created_at", brisbaneMonthStart().toISOString());
  return error ? null : (count ?? 0);
}

/** The firm's reports, newest first, including ones still being written or failed. */
export async function listFeasibilityReports(partnerId: string) {
  const { data } = await supabase
    .from("partner_feasibility_reports")
    .select("id,address,title,status,error,created_at,job_started_at")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(200);
  return data ?? [];
}
