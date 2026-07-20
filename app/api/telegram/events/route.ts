import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { summarise, type TelegramEvent } from "../../../../utils/telegram-health";

export const dynamic = "force-dynamic";

/** True when the failure is just "table not created yet" (migration not run).
 * Covers both direct Postgres (42P01) and PostgREST's schema-cache miss
 * (PGRST205 → "Could not find the table … in the schema cache"). */
function tableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}

const MAX_LIMIT = 500;
const DEFAULT_WINDOW_HOURS = 24;

/**
 * GET /api/telegram/events — the NEXUS Telegram alert stream.
 *
 * Query params:
 *   hours=24        lookback window (default 24, max 720)
 *   source=oncall_agent   filter to one originating script
 *   failures=1      only sends Telegram rejected
 *   limit=200       row cap (default 200, max 500)
 *
 * Rows are written by NEXUS's projects/nexus_notify.py — the CRM never writes
 * here. There is deliberately no POST: the Bot API can't be polled for a bot's
 * own outbound messages, so capture has to happen in the sending process, and
 * that process already has the Supabase service key. Adding a CRM ingest
 * endpoint would mean a second auth path (this host is behind Cloudflare
 * Access, which NEXUS has no service token for) for no gain.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const hours = Math.min(
    Math.max(Number(url.searchParams.get("hours")) || DEFAULT_WINDOW_HOURS, 1),
    720,
  );
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), MAX_LIMIT);
  const source = url.searchParams.get("source");
  const failuresOnly = url.searchParams.get("failures") === "1";

  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  try {
    let q = supabase
      .from("telegram_events")
      .select(
        "id, source, direction, chat_id, text, ok, error_code, error_desc, severity, category, meta, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (source) q = q.eq("source", source);
    if (failuresOnly) q = q.eq("ok", false);

    const { data, error } = await q;

    if (error) {
      if (tableMissing(error)) {
        // Not an error state — the feature ships before the SQL is applied.
        return NextResponse.json({
          ok: true,
          migrated: false,
          events: [],
          summary: summarise([]),
          message:
            "Run migrations/20260720_telegram_events.sql in the Supabase SQL editor to start recording.",
        });
      }
      throw error;
    }

    const events = (data ?? []) as TelegramEvent[];
    return NextResponse.json({
      ok: true,
      migrated: true,
      events,
      summary: summarise(events),
      window: { hours, since },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Telegram events";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
