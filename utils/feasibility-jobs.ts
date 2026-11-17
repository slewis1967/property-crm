/**
 * Background generation for the STAFF planning-feasibility report
 * (feasibility_jobs, migration 20261117e). The partner portal has its own
 * equivalent on partner_feasibility_reports (utils/partner-feasibility-job.ts),
 * because partner reports also carry a monthly allowance and are saved per firm.
 *
 * Flow: the staff route inserts a pending job and calls requestStaffFeasibility;
 * netlify/functions/feasibility-background.mts runs runStaffFeasibilityJob; the
 * page polls GET /api/ai/planning-feasibility/jobs/<id>.
 */
import { supabase } from "./supabase";
import { backgroundFunctionUrl, triggerBackgroundFunction } from "./background-trigger";
import { runPlanningFeasibility } from "./planning-feasibility";
import { storableReport } from "./partner-feasibility";

export const STAFF_FEASIBILITY_FUNCTION = "/.netlify/functions/feasibility-background";

type StoredRequest = {
  address: string;
  messages: { role: "user" | "assistant"; content: string }[];
  prepared?: { location: unknown } | null;
};

export async function runStaffFeasibilityJob(jobId: string): Promise<{ outcome: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { outcome: "bad_id" };

  // Conditional start: a duplicate trigger finds nothing to claim.
  const { data: claimed } = await supabase
    .from("feasibility_jobs")
    .update({ job_started_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .is("job_started_at", null)
    .select("id,request")
    .maybeSingle();
  if (!claimed) return { outcome: "not_claimable" };

  const req = claimed.request as StoredRequest | null;
  const fail = async (msg: string) =>
    supabase.from("feasibility_jobs").update({ status: "failed", error: msg.slice(0, 500) }).eq("id", jobId);
  if (!Array.isArray(req?.messages)) {
    await fail("The request was incomplete.");
    return { outcome: "no_request" };
  }

  let r;
  try {
    r = await runPlanningFeasibility(
      { phase: "report", address: req.address ?? "", messages: req.messages, prepared: req.prepared ?? undefined },
      { audience: "nextkey" },
    );
  } catch (e) {
    r = { status: 500, payload: { ok: false, error: e instanceof Error ? e.message : "Report failed" } };
  }
  if (r.status !== 200) {
    await fail(typeof r.payload.error === "string" ? r.payload.error : "The report couldn't be written.");
    return { outcome: "failed" };
  }

  const report = storableReport((r.payload as { report?: unknown }).report);
  const { error } = await supabase.from("feasibility_jobs").update({ status: "ready", report, error: null }).eq("id", jobId);
  if (error) {
    await fail("The report was written but couldn't be stored. Please try again.");
    return { outcome: "save_failed" };
  }
  return { outcome: "ready" };
}

/** Hand a job to the background function; true only on a real 202 (see utils/background-trigger.ts). */
export async function requestStaffFeasibility(jobId: string): Promise<boolean> {
  const url = backgroundFunctionUrl(STAFF_FEASIBILITY_FUNCTION, process.env.STAFF_FEASIBILITY_FUNCTION_URL);
  return (await triggerBackgroundFunction(url, { jobId: jobId }, "staff-feasibility")).ok;
}
