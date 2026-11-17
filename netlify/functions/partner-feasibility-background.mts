/**
 * Background function: write one partner planning-feasibility report.
 *
 * The "-background" suffix makes Netlify answer 202 at once and allow up to
 * 15 minutes. A report takes 30-50s, longer than a normal request may run
 * (the first live one got a 504 at 31s). Triggered by
 * utils/partner-feasibility-job.ts requestPartnerFeasibility after the API
 * claims the firm's slot; the portal page polls the row for the result.
 *
 * Machine-to-machine, so it carries no partner session: secured by the same
 * CRON_SECRET bearer as the other background jobs, failing closed when unset.
 * It only acts on a row that is still pending and not yet started.
 */
import { timingSafeEqual } from "node:crypto";
import { runPartnerFeasibilityJob } from "../../utils/partner-feasibility-job";
import { supabase } from "../../utils/supabase";

// NOTE: nothing here may import `next/*` (utils/rate-limit.ts does): a Netlify
// background function is bundled on its own, without Next.js, and crashes on
// load with "Cannot find module .../next/server" (17 Nov 2026). Guarded by
// utils/netlify-functions-imports.test.ts.

/** At most 5 refusal traces per 10 minutes per instance. */
const REFUSAL_WINDOW_MS = 10 * 60_000;
let refusalWindowStart = 0;
let refusalCount = 0;
function mayTraceRefusal(now = Date.now()): boolean {
  if (now - refusalWindowStart > REFUSAL_WINDOW_MS) {
    refusalWindowStart = now;
    refusalCount = 0;
  }
  refusalCount += 1;
  return refusalCount <= 5;
}

/** Durable trace in the append-only audit log: Netlify CLI shows no background-function logs. */
async function trace(action: string, detail: Record<string, unknown>) {
  await supabase
    .from("partner_events")
    .insert({ actor_type: "system", actor: "partner-feasibility-background", action, detail })
    .then(({ error }) => error && console.error("trace failed", error.message));
}

function authorised(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const given = Buffer.from((m?.[1] || "").trim());
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

const handler = async (req: Request) => {
  const ok = req.method === "POST" && authorised(req);
  if (!ok) {
    // Refusals are recorded too (so "reached but refused" is visible), but
    // capped: an unauthenticated caller must not be able to fill the
    // permanent audit log. At most 5 per 10 minutes per instance.
    if (mayTraceRefusal()) {
      await trace("feasibility_job_refused", { method: req.method, has_bearer: /^Bearer\s/i.test(req.headers.get("authorization") || "") });
    }
    return new Response("Forbidden", { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { reportId?: unknown };
  const id = typeof body.reportId === "string" ? body.reportId : "";
  // First contact past the secret check: separates "never reached" from "ran".
  await trace("feasibility_job_invoked", { report_id: id });
  try {
    const r = await runPartnerFeasibilityJob(id);
    console.log("partner-feasibility", JSON.stringify({ id, ...r }));
    await trace("feasibility_job_finished", { report_id: id, outcome: r.outcome });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("partner-feasibility failed", id, message);
    await trace("feasibility_job_crashed", { report_id: id, error: message.slice(0, 300) });
  }
  return new Response(null, { status: 202 });
};
export default handler;
