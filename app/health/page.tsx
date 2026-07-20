import { supabase } from "../../utils/supabase";
import {
  summarise,
  relativeTime,
  explainFailure,
  normaliseSeverity,
  type TelegramEvent,
} from "../../utils/telegram-health";

export const dynamic = "force-dynamic";

/** Mirrors the guard in app/api/telegram/events/route.ts — the page must render
 * before the migration has been run, not 500. */
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

const STATUS_STYLES: Record<string, { chip: string; bar: string; label: string }> = {
  healthy: { chip: "bg-green-100 text-green-700 border-green-200", bar: "bg-green-500", label: "Healthy" },
  degraded: { chip: "bg-amber-100 text-amber-700 border-amber-200", bar: "bg-amber-500", label: "Degraded" },
  critical: { chip: "bg-red-100 text-red-700 border-red-200", bar: "bg-red-500", label: "Critical" },
  unknown: { chip: "bg-gray-100 text-gray-600 border-gray-200", bar: "bg-gray-400", label: "No data" },
};

const SEVERITY_STYLES: Record<string, string> = {
  info: "bg-gray-100 text-gray-600",
  warning: "bg-amber-100 text-amber-700",
  error: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export default async function HealthPage({
  searchParams,
}: {
  searchParams: Promise<{ hours?: string; source?: string; failures?: string }>;
}) {
  const params = await searchParams;
  const hours = Math.min(Math.max(Number(params.hours) || 24, 1), 720);
  const sourceFilter = params.source ?? null;
  const failuresOnly = params.failures === "1";

  const since = new Date(Date.now() - hours * 3600_000).toISOString();

  let events: TelegramEvent[] = [];
  let migrated = true;
  let loadError: string | null = null;

  try {
    let q = supabase
      .from("telegram_events")
      .select(
        "id, source, direction, chat_id, text, ok, error_code, error_desc, severity, category, meta, created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (sourceFilter) q = q.eq("source", sourceFilter);
    if (failuresOnly) q = q.eq("ok", false);

    const { data, error } = await q;
    if (error) {
      if (tableMissing(error)) migrated = false;
      else loadError = error.message;
    } else {
      events = (data ?? []) as TelegramEvent[];
    }
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load Telegram events";
  }

  const summary = summarise(events);
  const style = STATUS_STYLES[summary.status] ?? STATUS_STYLES.unknown;
  const failures = events.filter((e) => !e.ok);

  return (
    <div>
      <div className="mb-5 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold flex items-center gap-2 lg:gap-3">
          <span>📡</span> Bot Health
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Every alert NEXUS sends through <code className="bg-gray-100 px-1 rounded">@elvsnextkey_bot</code>{" "}
          — and every send Telegram rejected. Last {hours}h.
        </p>
      </div>

      {!migrated && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">Not recording yet</p>
          <p className="text-sm text-amber-800 mt-1">
            Run <code className="bg-amber-100 px-1 rounded">migrations/20260720_telegram_events.sql</code>{" "}
            in the Supabase SQL editor. Until then NEXUS keeps alerting normally — it just
            isn&apos;t keeping a record here.
          </p>
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-semibold text-red-900">Couldn&apos;t load events</p>
          <p className="text-sm text-red-800 mt-1">{loadError}</p>
        </div>
      )}

      {/* Status banner */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className={`h-1 ${style.bar}`} />
        <div className="p-5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${style.chip}`}>
              {style.label}
            </span>
            <span className="text-sm text-gray-700">{summary.headline}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
            <Stat label="Sends" value={String(summary.total)} />
            <Stat
              label="Rejected"
              value={String(summary.failures)}
              tone={summary.failures > 0 ? "bad" : undefined}
            />
            <Stat label="Last delivered" value={relativeTime(summary.lastOkAt)} />
            <Stat label="Scripts reporting" value={String(summary.sources.length)} />
          </div>
        </div>
      </div>

      {/* Filters — plain links so this stays a server component. */}
      <div className="flex flex-wrap gap-2 mb-6 text-sm">
        <FilterLink href="/health" active={!failuresOnly && !sourceFilter && hours === 24}>
          Last 24h
        </FilterLink>
        <FilterLink href="/health?hours=168" active={hours === 168 && !failuresOnly && !sourceFilter}>
          Last 7d
        </FilterLink>
        <FilterLink href={`/health?hours=${hours}&failures=1`} active={failuresOnly}>
          Failures only
        </FilterLink>
        {sourceFilter && (
          <span className="px-3 py-1.5 rounded-lg bg-gray-900 text-white">
            {sourceFilter} · <a href={`/health?hours=${hours}`} className="underline">clear</a>
          </span>
        )}
      </div>

      {/* Failures get their own section — this is what the page is for. */}
      {failures.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">
            Rejected sends <span className="text-gray-400 font-normal">({failures.length})</span>
          </h2>
          <div className="space-y-3">
            {failures.map((e) => (
              <div key={e.id} className="rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <a
                      href={`/health?hours=${hours}&source=${encodeURIComponent(e.source)}`}
                      className="font-mono text-sm font-semibold text-gray-900 hover:underline"
                    >
                      {e.source}
                    </a>
                    {e.category && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                        {e.category}
                      </span>
                    )}
                    {e.error_code != null && (
                      <span className="text-xs text-red-600 font-mono">HTTP {e.error_code}</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{relativeTime(e.created_at)}</span>
                </div>
                <p className="text-sm text-red-900 mt-2">{explainFailure(e)}</p>
                {e.text && (
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2 whitespace-pre-wrap">
                    Undelivered message: {e.text.slice(0, 200)}
                    {e.text.length > 200 ? "…" : ""}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-script rollup */}
      {summary.sources.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-3">By script</h2>
          <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Script</th>
                  <th className="text-right font-semibold px-4 py-2.5">Sends</th>
                  <th className="text-right font-semibold px-4 py-2.5">Rejected</th>
                  <th className="text-left font-semibold px-4 py-2.5">Last delivered</th>
                </tr>
              </thead>
              <tbody>
                {summary.sources.map((s) => (
                  <tr key={s.source} className="border-t border-gray-100">
                    <td className="px-4 py-2.5">
                      <a
                        href={`/health?hours=${hours}&source=${encodeURIComponent(s.source)}`}
                        className="font-mono text-gray-900 hover:underline"
                      >
                        {s.source}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-600">{s.total}</td>
                    <td
                      className={`px-4 py-2.5 text-right ${s.failures > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}
                    >
                      {s.failures}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{relativeTime(s.lastOkAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Full stream */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Alert stream</h2>
        {events.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">
              {migrated
                ? "Nothing recorded in this window. A quiet bot usually means nothing has gone wrong."
                : "Waiting on the migration."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => {
              const sev = normaliseSeverity(e.severity as string);
              return (
                <div
                  key={e.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 flex items-start gap-3"
                >
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${SEVERITY_STYLES[sev]}`}
                  >
                    {sev}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={`/health?hours=${hours}&source=${encodeURIComponent(e.source)}`}
                        className="font-mono text-xs text-gray-500 hover:underline"
                      >
                        {e.source}
                      </a>
                      {!e.ok && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          not delivered
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap line-clamp-3">
                      {e.text ?? <span className="text-gray-400 italic">(no body)</span>}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {relativeTime(e.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="text-xs text-gray-400 mt-8 leading-relaxed">
        Only scripts routed through <code>nexus_notify.py</code> appear here. A bot cannot read
        back its own sent messages via the Telegram API, so anything still calling{" "}
        <code>api.telegram.org</code> directly is invisible to this page — see{" "}
        <code>docs/FEATURE-telegram-monitoring.md</code> for what&apos;s migrated.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bad" }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-0.5 ${tone === "bad" ? "text-red-600" : "text-gray-900"}`}>
        {value}
      </div>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`px-3 py-1.5 rounded-lg border transition ${
        active
          ? "bg-gray-900 text-white border-gray-900"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </a>
  );
}
