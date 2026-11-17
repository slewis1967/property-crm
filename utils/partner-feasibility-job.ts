/**
 * The background half of a partner feasibility report.
 *
 * The API claims the slot and stores the engine input on the row
 * (`request`), then asks netlify/functions/partner-feasibility-background.mts
 * to run this. It:
 *   1. takes the job with a conditional update on job_started_at, so a
 *      duplicate trigger cannot pay for the model twice;
 *   2. runs the shared engine (audience "neutral");
 *   3. writes the report and marks the row 'ready', or 'failed' with a
 *      message. A 400 means the engine refused before calling the model, so
 *      that row is deleted and the slot released; any other failure counts.
 */
import { supabase } from "./supabase";
import { runPlanningFeasibility } from "./planning-feasibility";
import { storableReport } from "./partner-feasibility";

export const FEASIBILITY_FUNCTION = "/.netlify/functions/partner-feasibility-background";

type StoredRequest = {
  address: string;
  messages: { role: "user" | "assistant"; content: string }[];
  prepared?: { location: unknown } | null;
};

export async function runPartnerFeasibilityJob(reportId: string): Promise<{ outcome: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return { outcome: "bad_id" };

  const { data: claimed } = await supabase
    .from("partner_feasibility_reports")
    .update({ job_started_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("status", "pending")
    .is("job_started_at", null)
    .select("id,request")
    .maybeSingle();
  if (!claimed) return { outcome: "not_claimable" };

  const req = claimed.request as StoredRequest | null;
  if (!req?.address || !Array.isArray(req.messages)) {
    await supabase.from("partner_feasibility_reports").delete().eq("id", reportId).eq("status", "pending");
    return { outcome: "no_request" };
  }

  let r;
  try {
    r = await runPlanningFeasibility(
      { phase: "report", address: req.address, messages: req.messages, prepared: req.prepared ?? undefined },
      { audience: "neutral" },
    );
  } catch (e) {
    r = { status: 500, payload: { ok: false, error: e instanceof Error ? e.message : "Report failed" } };
  }

  if (r.status === 400) {
    await supabase.from("partner_feasibility_reports").delete().eq("id", reportId).eq("status", "pending");
    return { outcome: "refused_before_model" };
  }
  if (r.status !== 200) {
    const msg = typeof r.payload.error === "string" ? r.payload.error : "The report couldn't be written.";
    await supabase
      .from("partner_feasibility_reports")
      .update({ status: "failed", error: msg.slice(0, 500) })
      .eq("id", reportId);
    return { outcome: "failed" };
  }

  const report = storableReport((r.payload as { report?: unknown }).report);
  const { error } = await supabase
    .from("partner_feasibility_reports")
    .update({
      status: "ready",
      title: typeof report.title === "string" ? report.title.slice(0, 200) : null,
      report,
      error: null,
    })
    .eq("id", reportId);
  if (error) {
    await supabase
      .from("partner_feasibility_reports")
      .update({ status: "failed", error: "The report was written but couldn't be saved. Please contact NextKey." })
      .eq("id", reportId);
    return { outcome: "save_failed" };
  }
  return { outcome: "ready" };
}

/**
 * Ask the background function to write a report. Fire-and-forget, same
 * transport as utils/tfn-image-redact-trigger.ts (CRON_SECRET bearer, plus the
 * Cloudflare Access service token because the production host is behind
 * Access). Returns false if the request could not be handed over.
 */
export async function requestPartnerFeasibility(reportId: string): Promise<boolean> {
  // DEPLOY_URL is this deploy's own *.netlify.app address: it reaches the
  // function without passing Cloudflare Access, and runs the same code as the
  // request that claimed the slot. The bearer secret is what guards it.
  const site = (process.env.DEPLOY_URL || process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, "");
  const url = (process.env.PARTNER_FEASIBILITY_FUNCTION_URL || "").trim() || (site ? `${site}${FEASIBILITY_FUNCTION}` : "");
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!url || !secret) return false;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ reportId }),
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}
