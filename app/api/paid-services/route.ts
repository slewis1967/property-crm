import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  BILLING_CYCLES,
  CRITICALITIES,
  SERVICE_CATEGORIES,
  SERVICE_STATUSES,
  assessAll,
  brisbaneToday,
  paidErrMessage,
  paidServicesTableMissing,
  summarise,
  BALANCE_SOURCES,
  type PaidService,
} from "../../../utils/paid-services";

export const dynamic = "force-dynamic";

export const MIGRATION_HINT =
  "Paid Accounts storage isn't set up yet — run migrations/20260725_paid_services.sql in the Supabase SQL editor.";

/** Last automated alert-sweep heartbeat, so a dead cron is visible in the UI. */
async function lastCheck(): Promise<{ at: string | null; dryRun: boolean | null; note: string | null }> {
  try {
    const { data, error } = await supabase
      .from("paid_service_alerts")
      .select("created_at, dry_run, message")
      .eq("kind", "run")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    const row = data?.[0];
    return { at: row?.created_at ?? null, dryRun: row?.dry_run ?? null, note: row?.message ?? null };
  } catch {
    // A missing alert table must not break the panel.
    return { at: null, dryRun: null, note: null };
  }
}

/**
 * GET — the whole register plus the computed attention/spend picture.
 *
 * Attention is computed here (not in Postgres) so the panel, the sidebar badge
 * and the email digest all read the same rules from utils/paid-services.ts.
 * The table is small (tens of rows), so one unpaginated read is correct.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("paid_services")
      .select("*")
      .order("name", { ascending: true })
      .limit(500);
    if (error) {
      if (paidServicesTableMissing(error)) {
        return NextResponse.json({
          ok: true,
          services: [],
          assessed: [],
          summary: null,
          today: brisbaneToday(),
          lastCheck: { at: null, dryRun: null, note: null },
          alertsEnabled: alertsEnabled(),
          alertRecipient: alertRecipient(),
          migrationNeeded: true,
          hint: MIGRATION_HINT,
        });
      }
      throw error;
    }

    const services = (data ?? []) as PaidService[];
    const today = brisbaneToday();
    return NextResponse.json({
      ok: true,
      services,
      assessed: assessAll(services, today),
      summary: summarise(services, today),
      today,
      lastCheck: await lastCheck(),
      alertsEnabled: alertsEnabled(),
      alertRecipient: alertRecipient(),
      migrationNeeded: false,
    });
  } catch (e) {
    log.error("paid_services.list_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "List failed") }, { status: 500 });
  }
}

function alertsEnabled(): boolean {
  return process.env.PAID_ALERTS_ENABLED === "true";
}
function alertRecipient(): string {
  return process.env.PAID_ALERTS_TO || process.env.OWNER_EMAIL || "sean.l@nextkey.com.au";
}

// ── field coercion ───────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
/** 'YYYY-MM-DD' or null. Rejects anything else rather than storing a bad date. */
const date = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
/** 'YYYY-MM' or null — accepts the 'MM/YY' people actually type off a card. */
const month = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [y, m] = s.split("-");
    return `${y}-${m.padStart(2, "0")}`;
  }
  const slash = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(s);
  if (slash) {
    const mm = slash[1].padStart(2, "0");
    const yy = slash[2].length === 2 ? `20${slash[2]}` : slash[2];
    return `${yy}-${mm}`;
  }
  return null;
};
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

/** Editable columns, mapped from request body → row. Shared by POST and PATCH. */
export function coerceServiceBody(b: Record<string, unknown>, forInsert: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);

  if (forInsert || has("name")) row.name = str(b.name);
  if (forInsert || has("category")) row.category = oneOf(b.category, SERVICE_CATEGORIES, "other");
  if (forInsert || has("criticality")) row.criticality = oneOf(b.criticality, CRITICALITIES, "important");
  if (forInsert || has("status")) row.status = oneOf(b.status, SERVICE_STATUSES, "active");
  if (forInsert || has("billing_cycle")) row.billing_cycle = oneOf(b.billing_cycle, BILLING_CYCLES, "monthly");
  if (forInsert || has("currency")) row.currency = (str(b.currency) ?? "AUD").toUpperCase().slice(0, 3);

  if (forInsert || has("purpose")) row.purpose = str(b.purpose);
  if (forInsert || has("vendor_url")) row.vendor_url = str(b.vendor_url);
  if (forInsert || has("account_ref")) row.account_ref = str(b.account_ref);
  if (forInsert || has("plan")) row.plan = str(b.plan);
  if (forInsert || has("payment_method")) row.payment_method = str(b.payment_method);
  if (forInsert || has("balance_unit")) row.balance_unit = str(b.balance_unit);
  if (forInsert || has("notes")) row.notes = str(b.notes);

  if (forInsert || has("cost")) row.cost = num(b.cost);
  if (forInsert || has("balance_remaining")) row.balance_remaining = num(b.balance_remaining);
  if (forInsert || has("low_balance_threshold")) row.low_balance_threshold = num(b.low_balance_threshold);
  // Only a known reader may be named — an arbitrary string would make the row
  // expect an automatic balance that nothing ever supplies.
  if (has("balance_source")) {
    const s = str(b.balance_source);
    row.balance_source = s && (BALANCE_SOURCES as readonly string[]).includes(s) ? s : null;
  }

  if (forInsert || has("next_due_date")) row.next_due_date = date(b.next_due_date);
  if (forInsert || has("last_paid_on")) row.last_paid_on = date(b.last_paid_on);
  if (forInsert || has("snoozed_until")) row.snoozed_until = date(b.snoozed_until);
  if (forInsert || has("card_expiry")) row.card_expiry = month(b.card_expiry);

  if (forInsert || has("auto_renew")) row.auto_renew = b.auto_renew !== false;
  if (forInsert || has("alert_lead_days")) {
    const n = num(b.alert_lead_days);
    row.alert_lead_days = n !== null && n >= 0 && n <= 365 ? Math.round(n) : 7;
  }
  return row;
}

/** POST — add a paid account to the register. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const row = coerceServiceBody(b, true);
    if (!row.name) {
      return NextResponse.json({ ok: false, error: "A service name is required" }, { status: 400 });
    }
    row.created_by = auth;

    const { data, error } = await supabase.from("paid_services").insert(row).select("id").single();
    if (error) {
      if (paidServicesTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      // 23505 = unique violation on `name` — the register is one row per account.
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json(
          { ok: false, error: `"${String(row.name)}" is already in the register.` },
          { status: 409 },
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    log.error("paid_services.create_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Save failed") }, { status: 500 });
  }
}
