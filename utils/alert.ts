/**
 * Ops alerting sink.
 *
 * `alertOps` escalates a GENUINE operational failure (a broadcast that didn't
 * enrol, an outbound send that Brevo rejected, an uncaught 5xx) to the human
 * operator by email — so real failures don't just vanish into Netlify stdout.
 *
 * Guarantees, in order of importance:
 *   1. The structured log is ALWAYS written first (`log.error`). Even if the
 *      email send throws, the failure is still greppable in Netlify logs.
 *   2. Rate-limited / deduped via the `ops_alerts` table so a failing route
 *      firing 200×/min can never turn into 200 emails. One alert per
 *      `event_key` per window (default 15 min, env `OPS_ALERT_WINDOW_MIN`);
 *      intervening occurrences bump `suppressed_since_last` and are reported
 *      as "+N similar suppressed" on the next alert that does go out.
 *   3. Fail-open: everything is wrapped in try/catch. A broken alerter must
 *      NEVER break the request that called it. If `ops_alerts` is missing the
 *      alerter degrades to a best-effort send instead of crashing.
 *
 * Node-only by construction: this module statically imports ONLY the edge-safe
 * logger. `sendBrevoEmail` (fetch) and the Supabase client are pulled in with
 * lazy `await import(...)` INSIDE `alertOps`, so importing this module never
 * drags Brevo/Supabase onto an edge bundle. Do NOT add static imports of
 * ./brevo or ./supabase here, and never import this module from proxy.ts or
 * logger.ts (the edge path).
 */

import { log } from "./logger";

export type AlertSeverity = "error" | "critical";

export interface AlertOpsParams {
  /** Short stable event name, e.g. "broadcast.enrolment_failed". Drives the
   *  subject line and (with `discriminator`) the dedup key. */
  event: string;
  /** Human-readable one-liner describing what failed. */
  message: string;
  /** Structured detail (ids, error text, counts). Logged + pretty-printed
   *  into the email body. */
  context?: Record<string, unknown>;
  /** Defaults to "error". Cosmetic — shown in the body. */
  severity?: AlertSeverity;
  /** Stable discriminator folded into the dedup key so distinct sources of the
   *  same event dedup independently, e.g. a route label. Deliberately NOT the
   *  full message (which varies per occurrence and would defeat dedup). */
  discriminator?: string;
}

/** Shape of a row in the `ops_alerts` dedup table. */
export interface OpsAlertRow {
  event_key: string;
  last_sent_at: string | null;
  suppressed_since_last: number | null;
}

const DEFAULT_WINDOW_MIN = 15;
const DEFAULT_OPS_EMAIL = "slewis877@gmail.com";
const DEFAULT_TIMEOUT_MS = 2500;

/** Resolve the dedup window (minutes) from env, falling back to the default. */
export function opsAlertWindowMin(): number {
  const raw = process.env.OPS_ALERT_WINDOW_MIN;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_WINDOW_MIN;
}

/** Hard cap (ms) on the alerter's async work so a slow/unreachable Supabase or
 *  Brevo can never stall the calling request. From env, else the default. */
export function opsAlertTimeoutMs(): number {
  const raw = process.env.OPS_ALERT_TIMEOUT_MS;
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Reject after `ms` if the wrapped promise hasn't settled. The underlying work
 *  is left to settle on its own (best-effort); we just stop waiting on it. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ops_alert timed out after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Derive a STABLE dedup key from the event + an optional discriminator.
 *
 * Intentionally ignores `message`: the message varies per occurrence (it
 * carries the specific error text), so keying on it would give every
 * occurrence its own key and defeat rate-limiting. The discriminator (e.g. a
 * route label) lets the same event from different call sites dedup separately.
 */
export function deriveEventKey(event: string, discriminator?: string): string {
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_.:/-]/g, "");
  const base = norm(event) || "unknown";
  const disc = discriminator ? norm(discriminator) : "";
  return disc ? `${base}::${disc}` : base;
}

/**
 * Pure dedup decision: should we SEND now, or suppress?
 *
 * Send when there is no prior row, no recorded send time, an unparseable
 * timestamp, or the last send is at least `windowMin` minutes ago. Extracted
 * so the rate-limit logic is unit-testable without Supabase or a clock.
 */
export function shouldSend(
  row: OpsAlertRow | null | undefined,
  now: Date,
  windowMin: number,
): boolean {
  if (!row || !row.last_sent_at) return true;
  const last = new Date(row.last_sent_at).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= windowMin * 60_000;
}

/** True when the Supabase error indicates the `ops_alerts` table is absent. */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code && err.code.startsWith("PGRST")) return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table");
}

/** Build the plain-text alert body. */
function buildText(
  message: string,
  context: Record<string, unknown> | undefined,
  severity: AlertSeverity,
  eventKey: string,
  suppressed: number,
  iso: string,
): string {
  const lines: string[] = [message, ""];
  lines.push(`Severity:  ${severity}`);
  lines.push(`Event key: ${eventKey}`);
  lines.push(`Time:      ${iso}`);
  if (suppressed > 0) {
    lines.push("");
    lines.push(`+${suppressed} similar suppressed since last alert`);
  }
  if (context && Object.keys(context).length > 0) {
    lines.push("");
    lines.push("Context:");
    let pretty: string;
    try {
      pretty = JSON.stringify(context, null, 2);
    } catch {
      pretty = String(context);
    }
    lines.push(pretty);
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escalate a genuine failure to the operator. Fire-and-forget friendly:
 * always resolves, never rejects. Callers may `await` it or not.
 */
export async function alertOps(params: AlertOpsParams): Promise<void> {
  const { event, message, context, severity = "error", discriminator } = params;

  // (1) The log MUST be written first and unconditionally — it is the sink of
  //     last resort if the email path is broken or unconfigured.
  log.error(event, { message, ...(context ?? {}) });

  try {
    const eventKey = deriveEventKey(event, discriminator);
    const windowMin = opsAlertWindowMin();
    const now = new Date();
    const to = process.env.OPS_ALERT_EMAIL || DEFAULT_OPS_EMAIL;
    const subject = `[NextKey CRM] ${event}`;

    // All network work runs inside `run()` so we can cap it with a timeout: a
    // slow or unreachable Supabase/Brevo must never stall the calling request
    // (which is often already on an error path returning a 500).
    const run = async (): Promise<void> => {
    // Lazy — keeps Brevo (fetch) + Supabase off any edge bundle that merely
    // imports a module which transitively imports this one.
    const { supabase } = await import("./supabase");
    const { sendBrevoEmail } = await import("./brevo");

    const send = async (suppressed: number): Promise<boolean> => {
      const iso = now.toISOString();
      const text = buildText(message, context, severity, eventKey, suppressed, iso);
      const html = `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
      const res = await sendBrevoEmail({
        to: [{ email: to }],
        subject,
        html,
        text,
        tags: ["ops-alert"],
      });
      if (!res.ok) {
        log.warn("ops_alert.send_failed", { event_key: eventKey, error: res.error });
        return false;
      }
      return true;
    };

    // If Supabase isn't configured, don't attempt the dedup query — the client
    // holds placeholder creds and the request would hang/fail. Degrade to a
    // best-effort single send (which itself no-ops if Brevo is unconfigured).
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      log.warn("ops_alert.supabase_unconfigured", { event_key: eventKey });
      await send(0);
      return;
    }

    // Read the dedup row.
    const { data: row, error: readErr } = await supabase
      .from("ops_alerts")
      .select("event_key,last_sent_at,suppressed_since_last")
      .eq("event_key", eventKey)
      .maybeSingle();

    if (readErr && isMissingTable(readErr)) {
      // Degrade gracefully: no dedup table → best-effort single send. Not a
      // spam loop because each caller invocation still sends at most once.
      log.warn("ops_alert.table_missing", { event_key: eventKey });
      await send(0);
      return;
    }
    if (readErr) {
      // Some other DB error — don't block the alert, best-effort send.
      log.warn("ops_alert.read_failed", { event_key: eventKey, error: readErr.message });
      await send(0);
      return;
    }

    const existing = (row as OpsAlertRow | null) ?? null;

    if (!shouldSend(existing, now, windowMin)) {
      // Within the window → suppress. Bump the counter so the next real alert
      // can report how many we swallowed.
      const nextCount = (existing?.suppressed_since_last ?? 0) + 1;
      const { error: upErr } = await supabase
        .from("ops_alerts")
        .update({ suppressed_since_last: nextCount })
        .eq("event_key", eventKey);
      if (upErr) {
        log.warn("ops_alert.suppress_update_failed", { event_key: eventKey, error: upErr.message });
      }
      return;
    }

    // Sending: report how many we suppressed since the last alert, then reset.
    const suppressed = existing?.suppressed_since_last ?? 0;
    const sent = await send(suppressed);

    // Reset the row so the window restarts from this send (and the suppressed
    // counter clears). Upsert covers both first-ever and repeat alerts. Only
    // reset the window if the send actually went out, so a transient Brevo
    // outage doesn't silently start a fresh suppression window with no email.
    if (sent) {
      const { error: resetErr } = await supabase
        .from("ops_alerts")
        .upsert(
          { event_key: eventKey, last_sent_at: now.toISOString(), suppressed_since_last: 0 },
          { onConflict: "event_key" },
        );
      if (resetErr) {
        log.warn("ops_alert.reset_failed", { event_key: eventKey, error: resetErr.message });
      }
    }
    };

    await withTimeout(run(), opsAlertTimeoutMs());
  } catch (e) {
    // Fail-open: the alerter must never break the calling request. The primary
    // log.error already fired above, so the failure is not lost.
    log.warn("ops_alert.unexpected_error", {
      event,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
