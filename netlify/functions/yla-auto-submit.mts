/**
 * Scheduled YLA auto-submit sweep (Netlify Scheduled Function).
 *
 * Runs inside Netlify (same env, no Cloudflare Access) and calls the shared
 * sweep directly. Fires every 2 hours (offset from the reminder sweep). The
 * sweep is idempotent and self-throttling, and — crucially — sends NOTHING to
 * YLA unless YLA_AUTOSUBMIT_ENABLED==="true"; until then each run is a dry run,
 * so this schedule is safe to ship before go-live.
 */
import { runYlaAutoSubmit } from "../../utils/yla-auto-submit";

export const config = { schedule: "30 */2 * * *" };

export default async () => {
  const result = await runYlaAutoSubmit();
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
};
