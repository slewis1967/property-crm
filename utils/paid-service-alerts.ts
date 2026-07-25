/**
 * Paid Accounts alert sweep — the thing that actually tells Sean a payment is
 * due before the service dies.
 *
 * Design:
 *  - ONE digest email per Brisbane day, listing every account that needs
 *    attention, rather than one email per problem. A per-item alert stream gets
 *    filtered to a folder within a week; a single daily "3 accounts need
 *    attention" does not.
 *  - Silent when there's nothing wrong. No "all good" mail — that trains you to
 *    ignore the sender.
 *  - `info`-severity items (no cost recorded, no renewal date) never email. They
 *    are setup nags and live in the panel only.
 *  - Every run writes a `kind='run'` heartbeat row, even a dry or empty one. The
 *    panel shows the last heartbeat, so a cron that stops firing is VISIBLE.
 *    This is the specific failure that let the YLA sweep look healthy while
 *    returning zero for weeks.
 *
 * SAFETY: nothing sends unless PAID_ALERTS_ENABLED === "true", so the schedule
 * can go live before the register is filled in. `force: true` (the panel's
 * "Send digest now" button) is a deliberate authenticated click by the operator
 * and bypasses both the enable gate and the once-a-day dedupe.
 */
import { supabase } from "./supabase";
import { sendBrevoEmail } from "./brevo";
import { log, errInfo } from "./logger";
import { refreshBalances } from "./paid-service-balances";
import {
  actionable,
  assessAll,
  brisbaneToday,
  paidErrMessage,
  paidServicesTableMissing,
  summarise,
  SEVERITY_RANK,
  type PaidService,
  type ServiceAttention,
  type Severity,
} from "./paid-services";

export function paidAlertsEnabled(): boolean {
  return process.env.PAID_ALERTS_ENABLED === "true";
}

export function paidAlertRecipient(): string {
  return process.env.PAID_ALERTS_TO || process.env.OWNER_EMAIL || "sean.l@nextkey.com.au";
}

function crmOrigin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.nextkey.com.au").replace(
    /\/+$/,
    "",
  );
}

export type PaidAlertRun = {
  ok: boolean;
  dryRun: boolean;
  /** Accounts that needed attention at warning+ severity. */
  flagged: number;
  critical: number;
  /** True when a digest was actually emailed. */
  sent: boolean;
  /** Why nothing was sent, when nothing was. */
  reason?: string;
  recipient?: string;
  today: string;
  headlines: string[];
  /** Live prepaid-balance pull done at the start of the run. */
  balances?: { checked: number; failed: number };
  error?: string;
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const SEVERITY_STYLE: Record<Severity, { label: string; colour: string; bg: string }> = {
  critical: { label: "Action now", colour: "#991b1b", bg: "#fee2e2" },
  warning: { label: "Coming up", colour: "#92400e", bg: "#fef3c7" },
  info: { label: "For info", colour: "#374151", bg: "#f3f4f6" },
};

/** Subject line: lead with the worst thing, because that's all a phone shows. */
export function digestSubject(items: ServiceAttention[]): string {
  const criticals = items.filter((a) => a.worst === "critical");
  const n = items.length;
  if (criticals.length > 0) {
    const first = criticals[0].items.find((i) => i.severity === "critical");
    const rest = n - 1;
    return rest > 0
      ? `Action needed: ${first?.headline ?? criticals[0].service.name} (+${rest} more)`
      : `Action needed: ${first?.headline ?? criticals[0].service.name}`;
  }
  return n === 1
    ? `Paid accounts: ${items[0].items[0]?.headline ?? "1 account needs attention"}`
    : `Paid accounts: ${n} accounts need attention`;
}

/**
 * The digest email. Plain, scannable, and every row says what to do — a bare
 * "payment due" with no amount, method or link is a to-do, not an alert.
 */
export function digestHtml(items: ServiceAttention[], today: string, monthlyLine: string): string {
  const rows = items
    .map((a) => {
      const worst = a.worst ?? "info";
      const style = SEVERITY_STYLE[worst];
      const lines = a.items
        .map(
          (i) =>
            `<div style="margin:2px 0"><strong>${esc(i.headline)}</strong><br>` +
            `<span style="color:#4b5563">${esc(i.detail)}</span></div>`,
        )
        .join("");
      const link = a.service.vendor_url
        ? `<a href="${esc(a.service.vendor_url)}" style="color:#0F4C5C">Open billing →</a>`
        : "";
      return `<tr>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;white-space:nowrap">
    <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;color:${style.colour};background:${style.bg}">${style.label}</span>
  </td>
  <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;line-height:1.45">
    ${lines}
    <div style="margin-top:4px;font-size:12px;color:#6b7280">
      ${esc(a.service.category)} · ${esc(a.service.criticality)}${a.service.plan ? ` · ${esc(a.service.plan)}` : ""} ${link}
    </div>
  </td>
</tr>`;
    })
    .join("");

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111827">
  <h2 style="color:#0F4C5C;margin:0 0 4px">Paid accounts needing attention</h2>
  <p style="margin:0 0 16px;color:#6b7280;font-size:13px">${esc(today)} (Brisbane) · ${items.length} account${items.length === 1 ? "" : "s"}${monthlyLine ? ` · ${esc(monthlyLine)}` : ""}</p>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px">${rows}</table>
  <p style="margin:18px 0 0;font-size:13px">
    <a href="${crmOrigin()}/paid-services" style="background:#0F4C5C;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;display:inline-block">Open the Paid Accounts panel</a>
  </p>
  <p style="margin:16px 0 0;color:#9ca3af;font-size:11px">
    Sent by the NextKey CRM paid-accounts check. Dates and amounts come from the register — if one is wrong, fix it in the panel.
  </p>
</div>`;
}

/** Plain-text twin, for the mail clients that show it (and for the log). */
export function digestText(items: ServiceAttention[], today: string): string {
  const body = items
    .map((a) => {
      const label = SEVERITY_STYLE[a.worst ?? "info"].label.toUpperCase();
      const lines = a.items.map((i) => `    - ${i.headline}\n      ${i.detail}`).join("\n");
      return `[${label}] ${a.service.name}\n${lines}${a.service.vendor_url ? `\n      Billing: ${a.service.vendor_url}` : ""}`;
    })
    .join("\n\n");
  return `Paid accounts needing attention — ${today} (Brisbane)\n\n${body}\n\nPanel: ${crmOrigin()}/paid-services\n`;
}

/** Has a digest already gone out (for real) on this Brisbane day? */
async function alreadySentToday(today: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("paid_service_alerts")
    .select("id")
    .eq("kind", "digest")
    .eq("alert_day", today)
    .eq("dry_run", false)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/**
 * Write the heartbeat + (when sent) one row per flagged account, so there's a
 * history of what was raised and when. Never throws — a logging failure must
 * not turn a delivered email into a reported failure.
 */
async function writeLog(
  run: PaidAlertRun,
  items: ServiceAttention[],
  note: string,
): Promise<void> {
  try {
    const rows: Record<string, unknown>[] = [
      {
        kind: "run",
        severity: run.critical > 0 ? "critical" : run.flagged > 0 ? "warning" : "info",
        message: note,
        channel: run.sent ? "email" : "none",
        dry_run: run.dryRun,
        alert_day: run.today,
        meta: { flagged: run.flagged, critical: run.critical, sent: run.sent, reason: run.reason ?? null },
      },
    ];
    if (run.sent) {
      rows.push({
        kind: "digest",
        severity: run.critical > 0 ? "critical" : "warning",
        message: digestSubject(items),
        channel: "email",
        dry_run: false,
        alert_day: run.today,
        meta: { recipient: run.recipient, headlines: run.headlines },
      });
      for (const a of items) {
        for (const i of a.items) {
          rows.push({
            service_id: a.service.id,
            kind: i.kind,
            severity: i.severity,
            message: i.headline,
            channel: "email",
            dry_run: false,
            alert_day: run.today,
            meta: { days: i.days },
          });
        }
      }
    }
    await supabase.from("paid_service_alerts").insert(rows);
  } catch (e) {
    log.warn("paid_alerts.log_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
  }
}

/**
 * Run the sweep.
 *
 * @param dryRun  undefined → use the PAID_ALERTS_ENABLED gate; true → never send.
 * @param force   operator-initiated: send even if the gate is off or one already
 *                went out today.
 */
export async function runPaidServiceAlerts(
  opts: { dryRun?: boolean; force?: boolean; now?: Date } = {},
): Promise<PaidAlertRun> {
  const today = brisbaneToday(opts.now ?? new Date());
  const force = opts.force === true;
  const dryRun = opts.dryRun === true ? true : force ? false : !paidAlertsEnabled();
  const recipient = paidAlertRecipient();

  const run: PaidAlertRun = {
    ok: true,
    dryRun,
    flagged: 0,
    critical: 0,
    sent: false,
    today,
    headlines: [],
    recipient,
  };

  // Pull live prepaid balances FIRST, so the digest reasons about what's actually
  // in the account rather than the last figure someone typed in. Best-effort: a
  // vendor outage records itself on the row (and surfaces as its own attention
  // item) instead of stopping the payment checks that don't depend on it.
  try {
    const refreshed = await refreshBalances();
    run.balances = { checked: refreshed.checked, failed: refreshed.failed };
  } catch (e) {
    log.warn("paid_alerts.balance_refresh_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
  }

  let services: PaidService[];
  try {
    const { data, error } = await supabase.from("paid_services").select("*").limit(500);
    if (error) throw error;
    services = (data ?? []) as PaidService[];
  } catch (e) {
    if (paidServicesTableMissing(e)) {
      run.reason = "paid_services table not migrated — nothing to check yet";
      await writeLog(run, [], run.reason);
      return run;
    }
    run.ok = false;
    run.error = paidErrMessage(e, "Could not read the register");
    log.error("paid_alerts.read_failed", { detail: run.error, ...errInfo(e) });
    return run;
  }

  const flagged = actionable(assessAll(services, today), "warning").sort(
    (a, b) => SEVERITY_RANK[b.worst ?? "info"] - SEVERITY_RANK[a.worst ?? "info"],
  );
  run.flagged = flagged.length;
  run.critical = flagged.filter((a) => a.worst === "critical").length;
  run.headlines = flagged.flatMap((a) => a.items.map((i) => i.headline));

  if (flagged.length === 0) {
    run.reason = "nothing needs attention";
    await writeLog(run, [], `Checked ${services.length} accounts — all clear`);
    return run;
  }

  if (dryRun) {
    run.reason = "dry run — set PAID_ALERTS_ENABLED=true to send";
    await writeLog(run, flagged, `DRY RUN — would alert on ${flagged.length} account(s)`);
    return run;
  }

  if (!force) {
    try {
      if (await alreadySentToday(today)) {
        run.reason = "a digest already went out today";
        await writeLog(run, flagged, `Already alerted today — ${flagged.length} account(s) still open`);
        return run;
      }
    } catch (e) {
      // Can't confirm; better a possible duplicate than a missed payment.
      log.warn("paid_alerts.dedupe_check_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    }
  }

  const summary = summarise(services, today);
  const aud = summary.spendByCurrency.find((c) => c.currency === "AUD");
  const monthlyLine = aud ? `about $${aud.monthly.toLocaleString("en-AU")} AUD/month committed` : "";

  const send = await sendBrevoEmail({
    to: [{ email: recipient }],
    subject: digestSubject(flagged),
    html: digestHtml(flagged, today, monthlyLine),
    text: digestText(flagged, today),
    tags: ["paid-accounts-alert"],
  });

  if (!send.ok) {
    run.ok = false;
    run.error = send.error;
    log.error("paid_alerts.send_failed", { detail: send.error, recipient });
    await writeLog(run, flagged, `Send FAILED: ${send.error}`);
    return run;
  }

  run.sent = true;
  log.info("paid_alerts.sent", { recipient, flagged: run.flagged, critical: run.critical });
  await writeLog(run, flagged, `Alerted ${recipient} about ${flagged.length} account(s)`);
  return run;
}
