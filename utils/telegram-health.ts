/**
 * Analysis for the /health page — turns raw `telegram_events` rows into the
 * status, per-source rollup and staleness picture the page renders.
 *
 * Pure and side-effect free on purpose (vitest: utils/telegram-health.test.ts).
 * The page does the fetching; everything that decides "is this healthy" lives
 * here so the rules are in one place and can be asserted.
 *
 * Context: these rows are written by NEXUS's projects/nexus_notify.py, the
 * single instrumented sender for `elvsnextkey_bot`. See
 * docs/FEATURE-telegram-monitoring.md.
 */

export type Severity = "info" | "warning" | "error" | "critical";

export type TelegramEvent = {
  id: string;
  source: string;
  direction: string;
  chat_id: string | null;
  text: string | null;
  ok: boolean;
  error_code: number | null;
  error_desc: string | null;
  severity: Severity | string;
  category: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
};

export type SourceRollup = {
  source: string;
  total: number;
  failures: number;
  lastAt: string | null;
  lastOkAt: string | null;
  worstSeverity: Severity;
};

export type HealthStatus = "healthy" | "degraded" | "critical" | "unknown";

export type HealthSummary = {
  status: HealthStatus;
  headline: string;
  total: number;
  failures: number;
  criticalCount: number;
  lastEventAt: string | null;
  lastOkAt: string | null;
  /** Minutes since the last *successful* send, or null if there's never been one. */
  minutesSinceOk: number | null;
  sources: SourceRollup[];
};

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  error: 2,
  critical: 3,
};

export function severityRank(s: string): number {
  return SEVERITY_RANK[s] ?? 0;
}

export function normaliseSeverity(s: string | null | undefined): Severity {
  if (s === "warning" || s === "error" || s === "critical") return s;
  return "info";
}

/**
 * How long the bot may go quiet before we call it stale.
 *
 * NEXUS's most frequent Telegram-capable cron is every 5 minutes, but it only
 * *sends* on a problem — a healthy system is legitimately silent for long
 * stretches. So silence alone is weak evidence and this threshold is
 * deliberately generous: 24h without a single successful send across ALL
 * sources is the point where "nothing was wrong" stops being the likely
 * explanation and "the sender is broken" starts.
 */
export const STALE_AFTER_MINUTES = 24 * 60;

function minutesBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 60000);
}

/** Roll events up per originating script, newest-first within each. */
export function rollupBySource(events: TelegramEvent[]): SourceRollup[] {
  const map = new Map<string, SourceRollup>();

  for (const e of events) {
    const cur = map.get(e.source) ?? {
      source: e.source,
      total: 0,
      failures: 0,
      lastAt: null,
      lastOkAt: null,
      worstSeverity: "info" as Severity,
    };

    cur.total += 1;
    if (!e.ok) cur.failures += 1;
    if (!cur.lastAt || e.created_at > cur.lastAt) cur.lastAt = e.created_at;
    if (e.ok && (!cur.lastOkAt || e.created_at > cur.lastOkAt)) cur.lastOkAt = e.created_at;

    const sev = normaliseSeverity(e.severity as string);
    if (severityRank(sev) > severityRank(cur.worstSeverity)) cur.worstSeverity = sev;

    map.set(e.source, cur);
  }

  // Sort by "most worth looking at": failures first, then severity, then volume.
  return [...map.values()].sort(
    (a, b) =>
      b.failures - a.failures ||
      severityRank(b.worstSeverity) - severityRank(a.worstSeverity) ||
      b.total - a.total ||
      a.source.localeCompare(b.source),
  );
}

/**
 * Overall verdict.
 *
 * Deliberate ordering: a *delivery* failure outranks an alarming *message*.
 * A critical-severity alert that reached Sean is the system working — he knows.
 * A send that Telegram rejected means an alert reached nobody, which is the
 * failure this whole feature exists to catch. So `ok === false` drives
 * "critical" while message severity alone can only reach "degraded".
 */
export function summarise(events: TelegramEvent[], now: Date = new Date()): HealthSummary {
  const total = events.length;
  const failures = events.filter((e) => !e.ok).length;

  // A failed send whose category says alerting itself is broken.
  const hardFailures = events.filter(
    (e) => !e.ok && (e.category === "auth" || e.category === "blocked" || e.category === "bad_chat_id"),
  ).length;

  const criticalCount = events.filter(
    (e) => !e.ok && normaliseSeverity(e.severity as string) === "critical",
  ).length;

  const sorted = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const lastEventAt = sorted[0]?.created_at ?? null;
  const lastOkAt = sorted.find((e) => e.ok)?.created_at ?? null;

  const minutesSinceOk = lastOkAt ? minutesBetween(new Date(lastOkAt), now) : null;
  const stale = minutesSinceOk === null || minutesSinceOk > STALE_AFTER_MINUTES;

  let status: HealthStatus;
  let headline: string;

  if (total === 0) {
    status = "unknown";
    headline =
      "No events recorded yet. Either nothing has sent since instrumentation went in, or the migration hasn't run.";
  } else if (hardFailures > 0) {
    status = "critical";
    headline = `${hardFailures} send${hardFailures === 1 ? "" : "s"} failed for a reason that stops alerts reaching anyone — check the token and chat ID.`;
  } else if (failures > 0) {
    status = "degraded";
    headline = `${failures} of ${total} send${total === 1 ? "" : "s"} were rejected by Telegram.`;
  } else if (stale) {
    status = "degraded";
    headline = lastOkAt
      ? `No successful send in over ${Math.floor(STALE_AFTER_MINUTES / 60)}h. Quiet is normal when nothing is wrong, but worth a look.`
      : "No successful send on record.";
  } else {
    status = "healthy";
    headline = `All ${total} send${total === 1 ? "" : "s"} delivered.`;
  }

  return {
    status,
    headline,
    total,
    failures,
    criticalCount,
    lastEventAt,
    lastOkAt,
    minutesSinceOk,
    sources: rollupBySource(events),
  };
}

/** "3m ago" / "2h ago" / "4d ago" — compact enough for a table cell. */
export function relativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "never";
  const mins = minutesBetween(new Date(iso), now);
  if (mins < 0) return "just now";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Plain-English explanation of a Telegram rejection.
 *
 * The API's own `description` is terse and assumes you know the Bot API
 * ("Bad Request: can't parse entities"). These say what actually broke and
 * what to do, because the person reading /health at 7am is triaging, not
 * studying protocol docs.
 */
export function explainFailure(e: TelegramEvent): string | null {
  if (e.ok) return null;
  switch (e.category) {
    case "auth":
      return "The bot token was rejected. It's been revoked or changed — update TELEGRAM_BOT_TOKEN in /mnt/c/NEXUS-Memory/.env. Until then no NEXUS alert reaches anyone.";
    case "blocked":
      return "The bot is blocked by the recipient, so Telegram refuses delivery. Unblock @elvsnextkey_bot in Telegram.";
    case "bad_chat_id":
      return "Telegram doesn't recognise that chat. Check TELEGRAM_CHAT_ID in the NEXUS .env.";
    case "parse_error":
      return "The message used Markdown formatting that Telegram couldn't parse — usually an unescaped _ * [ or ` in a name. The alert was never delivered.";
    case "message_too_long":
      return "Message exceeded Telegram's 4096-character limit and was rejected. The sender should truncate.";
    case "rate_limit":
      return "Telegram rate-limited the bot. Usually self-resolving; if it's frequent, the sender is too chatty.";
    case "telegram_outage":
      return "Telegram returned a server error. Almost always transient — worth chasing only if it persists.";
    case "transport":
      return "The send never reached Telegram (DNS, TLS or timeout). Check the host's network.";
    default:
      return e.error_desc ?? "Telegram rejected the send.";
  }
}
