import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { paidErrMessage } from "../../../../utils/paid-services";
import {
  paidAlertRecipient,
  paidAlertsEnabled,
  runPaidServiceAlerts,
} from "../../../../utils/paid-service-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — preview: run the sweep as a dry run and report what WOULD be emailed.
 * Sends nothing, so it's safe for the panel to call on demand.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await runPaidServiceAlerts({ dryRun: true });
    return NextResponse.json({ ok: true, preview: result, enabled: paidAlertsEnabled(), recipient: paidAlertRecipient() });
  } catch (e) {
    log.error("paid_alerts.preview_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Preview failed") }, { status: 500 });
  }
}

/**
 * POST — send the digest now, to the configured recipient.
 *
 * This is an authenticated operator action (Sean clicking "Send digest now"), so
 * it deliberately overrides both the PAID_ALERTS_ENABLED gate and the
 * once-per-day dedupe: the gate exists to stop the *cron* mailing before the
 * register is ready, not to stop a human asking for the digest. The recipient is
 * fixed by env (PAID_ALERTS_TO) — the request body cannot redirect it, so this
 * can't be used to mail an arbitrary address.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await runPaidServiceAlerts({ force: true });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error ?? "Send failed", result }, { status: 502 });
    }
    log.info("paid_alerts.manual_send", { by: auth, sent: result.sent, flagged: result.flagged });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    log.error("paid_alerts.manual_send_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Send failed") }, { status: 500 });
  }
}
