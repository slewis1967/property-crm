/**
 * Background function: write one STAFF planning-feasibility report
 * (feasibility_jobs). Netlify answers 202 at once and allows 15 minutes; a
 * report takes 30-50s, past the ~30s the request path in front of a normal
 * function allows. Triggered by utils/feasibility-jobs.ts requestStaffFeasibility.
 *
 * Machine-to-machine: CRON_SECRET bearer, failing closed when unset. Acts only
 * on a job that is still pending and not yet started.
 */
import { timingSafeEqual } from "node:crypto";
import { runStaffFeasibilityJob } from "../../utils/feasibility-jobs";

function authorised(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const given = Buffer.from((m?.[1] || "").trim());
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

const handler = async (req: Request) => {
  if (req.method !== "POST" || !authorised(req)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { jobId?: unknown };
  const id = typeof body.jobId === "string" ? body.jobId : "";
  try {
    const r = await runStaffFeasibilityJob(id);
    console.log("feasibility-job", JSON.stringify({ id, ...r }));
  } catch (e) {
    console.error("feasibility-job failed", id, e instanceof Error ? e.message : e);
  }
  return new Response(null, { status: 202 });
};
export default handler;
