/**
 * Document-reminder engine trigger.
 *
 *   GET  /api/document-requests/reminders            (AUTHED — rep preview)
 *     Always a DRY RUN: returns exactly which applicants are due a reminder
 *     right now and on which channels, without sending anything. Use it to
 *     eyeball the cadence before enabling live sends.
 *
 *   POST /api/document-requests/reminders            (AUTHED rep, or cron key)
 *     Runs the engine. Sends only when REMINDERS_ENABLED === "true" (otherwise
 *     it's forced to dry-run so the schedule can be live pre-sign-off). A
 *     scheduled caller authenticates with the x-reminders-key header instead of
 *     a Cloudflare Access identity.
 *     Body/query: { dry_run?: boolean } to force a dry run on demand.
 *
 * The heavy lifting lives in utils/document-reminders.ts (pure, tested).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { runDocumentReminders, remindersEnabled } from "../../../../utils/document-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const result = await runDocumentReminders({ dryRun: true });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  // Scheduled callers pass a shared secret; reps pass a Cloudflare Access session.
  const cronKey = process.env.REMINDERS_CRON_KEY;
  const provided = req.headers.get("x-reminders-key");
  const isCron = !!cronKey && provided === cronKey;
  if (!isCron) {
    const auth = await requireAuth(req);
    if (auth instanceof NextResponse) return auth;
  }

  const body = await req.json().catch(() => ({}));
  const url = new URL(req.url);
  const forceDry = body.dry_run === true || url.searchParams.get("dry_run") === "1";

  const result = await runDocumentReminders({ dryRun: forceDry ? true : !remindersEnabled() });
  return NextResponse.json(result);
}
