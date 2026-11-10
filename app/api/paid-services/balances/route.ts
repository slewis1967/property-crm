import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { paidErrMessage } from "../../../../utils/paid-services";
import { refreshBalances } from "../../../../utils/paid-service-balances";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — pull live prepaid balances now (OpenRouter, ClickSend) and write them
 * back to the register. Read-only against the vendors: it reads a balance, it
 * never spends, tops up or changes anything on their side.
 *
 * Also runs automatically at the start of the daily sweep, so the digest reasons
 * about current numbers rather than whatever was last typed in.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const result = await refreshBalances();
    log.info("paid_balances.manual_refresh", { by: auth, checked: result.checked, failed: result.failed });
    // A vendor being down is a reported outcome, not a 500 — the caller shows
    // the per-account errors.
    return NextResponse.json({ ok: result.ok, result });
  } catch (e) {
    log.error("paid_balances.refresh_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Balance refresh failed") }, { status: 500 });
  }
}
