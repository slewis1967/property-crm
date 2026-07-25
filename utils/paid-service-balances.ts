/**
 * Live prepaid-balance pulls for the Paid Accounts register.
 *
 * A prepaid account is the one case where a renewal date tells you nothing: the
 * service dies when the credit runs out, whenever that is. So for the two we can
 * read programmatically, we read them instead of asking Sean to remember.
 *
 * Which row gets which reading is driven by `paid_services.balance_source`
 * (set by the migration's seed), NOT by matching on the service name — a rename
 * in the panel must not silently stop the pull.
 *
 * Everything here is best-effort and non-throwing: a vendor outage records an
 * error on the row and leaves the previous balance visible. It does NOT wipe the
 * balance to zero (which would fire a bogus "balance empty" critical) — and the
 * stale/error state is itself surfaced as an attention item, so a pull that
 * quietly stops isn't mistaken for a healthy balance.
 *
 * The response shapes below were captured live on 2026-07-25; the parsers are
 * pure and pinned by tests against those payloads.
 */
import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import { BALANCE_SOURCES, paidErrMessage, paidServicesTableMissing, type BalanceSource } from "./paid-services";

export { BALANCE_SOURCES, type BalanceSource };

export type BalanceReading = {
  remaining: number;
  unit: string;
  /** Anything worth showing on the row (usage to date, auto-recharge state). */
  meta?: Record<string, unknown>;
};

export type BalanceResult =
  | { ok: true; source: BalanceSource; reading: BalanceReading }
  | { ok: false; source: BalanceSource; error: string };

const FETCH_TIMEOUT_MS = 8000;

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

// ── OpenRouter ───────────────────────────────────────────────────────────────

/**
 * `GET /api/v1/credits` → `{"data":{"total_credits":179,"total_usage":149.23}}`
 * Remaining is the difference; the API doesn't return it directly.
 *
 * Uses /credits, not /auth/key: the latter reports usage for the calling KEY
 * only, so with more than one key in play it under-reports and would show a
 * comfortable balance while the account is nearly dry. Credits are USD.
 */
export function parseOpenRouterCredits(json: unknown): BalanceReading {
  const d = (json as { data?: { total_credits?: unknown; total_usage?: unknown } } | null)?.data;
  const credits = Number(d?.total_credits);
  const usage = Number(d?.total_usage);
  if (!Number.isFinite(credits) || !Number.isFinite(usage)) {
    throw new Error("unexpected /credits response shape");
  }
  return {
    remaining: Math.round((credits - usage) * 100) / 100,
    unit: "USD",
    meta: { total_credits: credits, total_usage: Math.round(usage * 100) / 100 },
  };
}

async function fetchOpenRouter(): Promise<BalanceReading> {
  const key = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return parseOpenRouterCredits(await getJson("https://openrouter.ai/api/v1/credits", { Authorization: `Bearer ${key}` }));
}

// ── ClickSend ────────────────────────────────────────────────────────────────

/**
 * `GET /v3/account` → `{"data":{"balance":"74.970400","auto_recharge":0,
 *  "_currency":{"currency_name_short":"AUD"}, …}}`
 *
 * Note `balance` is a STRING, and `auto_recharge` is 0/1 — carried into meta
 * because an account with auto-recharge OFF is the one that can actually run out
 * mid-send.
 */
export function parseClickSendAccount(json: unknown): BalanceReading {
  const d = (json as {
    data?: { balance?: unknown; auto_recharge?: unknown; _currency?: { currency_name_short?: unknown } };
  } | null)?.data;
  const balance = Number(d?.balance);
  if (!Number.isFinite(balance)) throw new Error("unexpected /v3/account response shape");
  const unit = typeof d?._currency?.currency_name_short === "string" ? d._currency.currency_name_short : "AUD";
  return {
    remaining: Math.round(balance * 100) / 100,
    unit,
    meta: { auto_recharge: d?.auto_recharge === 1 || d?.auto_recharge === "1" },
  };
}

async function fetchClickSend(): Promise<BalanceReading> {
  const user = (process.env.CLICKSEND_USERNAME || "").trim();
  const key = (process.env.CLICKSEND_API_KEY || "").trim();
  if (!user || !key) throw new Error("CLICKSEND_USERNAME / CLICKSEND_API_KEY not set");
  const auth = Buffer.from(`${user}:${key}`).toString("base64");
  return parseClickSendAccount(await getJson("https://rest.clicksend.com/v3/account", { Authorization: `Basic ${auth}` }));
}

const FETCHERS: Record<BalanceSource, () => Promise<BalanceReading>> = {
  openrouter: fetchOpenRouter,
  clicksend: fetchClickSend,
};

/** Read one source. Never throws — a failure is a value. */
export async function readBalance(source: BalanceSource): Promise<BalanceResult> {
  try {
    return { ok: true, source, reading: await FETCHERS[source]() };
  } catch (e) {
    return { ok: false, source, error: e instanceof Error ? e.message : "balance check failed" };
  }
}

// ── refresh the register ─────────────────────────────────────────────────────

export type RefreshOutcome = {
  id: string;
  name: string;
  source: string;
  ok: boolean;
  /** New balance when the read succeeded. */
  remaining?: number;
  unit?: string;
  error?: string;
};

export type RefreshResult = {
  ok: boolean;
  checked: number;
  failed: number;
  outcomes: RefreshOutcome[];
  /** Set when the register itself couldn't be read. */
  error?: string;
};

/**
 * Pull live balances for every row with a `balance_source`, and write them back.
 *
 * One fetch per distinct source (not per row), so two rows pointing at the same
 * vendor don't double-call it. A failed read stamps `balance_check_error` +
 * `balance_checked_at` and leaves `balance_remaining` untouched.
 */
export async function refreshBalances(): Promise<RefreshResult> {
  const out: RefreshResult = { ok: true, checked: 0, failed: 0, outcomes: [] };

  let rows: { id: string; name: string; balance_source: string }[];
  try {
    const { data, error } = await supabase
      .from("paid_services")
      .select("id,name,balance_source")
      .not("balance_source", "is", null)
      .limit(100);
    if (error) throw error;
    rows = (data ?? []) as { id: string; name: string; balance_source: string }[];
  } catch (e) {
    // A register that predates the balance columns reports cleanly rather than
    // looking like a vendor outage.
    out.ok = false;
    out.error = paidServicesTableMissing(e)
      ? "paid_services not migrated yet"
      : paidErrMessage(e, "could not read the register");
    return out;
  }

  const wanted = [...new Set(rows.map((r) => r.balance_source))].filter((s): s is BalanceSource =>
    (BALANCE_SOURCES as readonly string[]).includes(s),
  );
  const readings = new Map<string, BalanceResult>();
  await Promise.all(wanted.map(async (s) => readings.set(s, await readBalance(s))));

  const checkedAt = new Date().toISOString();
  for (const row of rows) {
    const result = readings.get(row.balance_source);
    if (!result) {
      out.outcomes.push({
        id: row.id,
        name: row.name,
        source: row.balance_source,
        ok: false,
        error: `no reader for source "${row.balance_source}"`,
      });
      out.failed += 1;
      continue;
    }

    const patch: Record<string, unknown> = { balance_checked_at: checkedAt, updated_at: checkedAt };
    if (result.ok) {
      patch.balance_remaining = result.reading.remaining;
      patch.balance_unit = result.reading.unit;
      patch.balance_check_error = null;
    } else {
      // Leave balance_remaining alone: a vendor outage must not read as $0 and
      // fire a false "balance empty" critical.
      patch.balance_check_error = result.error;
    }

    try {
      const { error } = await supabase.from("paid_services").update(patch).eq("id", row.id);
      if (error) throw error;
    } catch (e) {
      log.warn("paid_balances.write_failed", { name: row.name, detail: paidErrMessage(e, ""), ...errInfo(e) });
      out.outcomes.push({ id: row.id, name: row.name, source: row.balance_source, ok: false, error: "could not save the reading" });
      out.failed += 1;
      continue;
    }

    if (result.ok) {
      out.checked += 1;
      out.outcomes.push({
        id: row.id,
        name: row.name,
        source: row.balance_source,
        ok: true,
        remaining: result.reading.remaining,
        unit: result.reading.unit,
      });
    } else {
      out.failed += 1;
      out.outcomes.push({ id: row.id, name: row.name, source: row.balance_source, ok: false, error: result.error });
    }
  }

  if (out.checked > 0 || out.failed > 0) {
    log.info("paid_balances.refreshed", { checked: out.checked, failed: out.failed });
  }
  return out;
}
