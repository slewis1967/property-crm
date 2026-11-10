/**
 * Scheduled document-reminder run (Netlify Scheduled Function).
 *
 * Runs inside the Netlify deployment — no Cloudflare Access to traverse, and it
 * reuses the same env (Supabase service key, Brevo, ClickSend) the app already
 * has. It calls the shared engine directly.
 *
 * Fires every 2 hours; the engine itself only acts inside Australia/Sydney civil
 * hours and at most once per request per day, so extra invocations (and DST
 * shifts) are cheap no-ops. Crucially, nothing sends unless REMINDERS_ENABLED
 * === "true" — until then each run is a dry run, so this schedule is safe to
 * ship before the copy is signed off.
 */
import { runDocumentReminders } from "../../utils/document-reminders";

export const config = { schedule: "0 */2 * * *" };

export default async () => {
  const result = await runDocumentReminders();
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
};
