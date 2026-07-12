"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Broadcast send-status history.
 *
 * Reads /api/broadcast/history and shows, newest-first, what actually
 * happened to each bulk send: how many went out (sent), how many the runner
 * hasn't processed yet (pending), and how many errored (failed) — with a
 * couple of failure-reason samples on demand. Turns the previously
 * fire-and-forget broadcast into something the operator can watch drain.
 *
 * Self-contained: fetches on mount, has a manual Refresh, and also refetches
 * when the composer dispatches a `broadcast:sent` window event so a freshly
 * queued send shows up (as pending) without a page reload.
 */

interface BroadcastRow {
  id: string;
  name: string | null;
  subject: string;
  slug: string | null;
  created_at: string | null;
  audience_total: number;
  sent: number;
  pending: number;
  failed: number;
  paused: number;
  sample_failed_reasons: string[];
}

const TEAL = "#0F4C5C";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Pill({
  label,
  count,
  color,
  bg,
}: {
  label: string;
  count: number;
  color: string;
  bg: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color, backgroundColor: bg }}
    >
      <strong className="tabular-nums">{count.toLocaleString()}</strong>
      {label}
    </span>
  );
}

function BroadcastCard({ b }: { b: BroadcastRow }) {
  const [showReasons, setShowReasons] = useState(false);
  const progress =
    b.audience_total > 0 ? Math.round((b.sent / b.audience_total) * 100) : 0;

  return (
    <li className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate" title={b.subject}>
            {b.subject}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtDate(b.created_at)} · {b.audience_total.toLocaleString()} recipient
            {b.audience_total === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Progress bar: fraction sent */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${progress}%`, backgroundColor: TEAL }}
        />
      </div>

      {/* Status breakdown */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill label="sent" count={b.sent} color={TEAL} bg="#E3F0F2" />
        <Pill label="pending" count={b.pending} color="#4B5563" bg="#F3F4F6" />
        <Pill label="failed" count={b.failed} color="#B91C1C" bg="#FEE2E2" />
        {b.paused > 0 && (
          <Pill label="paused" count={b.paused} color="#92400E" bg="#FEF3C7" />
        )}
        {b.failed > 0 && b.sample_failed_reasons.length > 0 && (
          <button
            type="button"
            onClick={() => setShowReasons((v) => !v)}
            className="text-xs text-red-700 underline hover:text-red-900"
          >
            {showReasons ? "hide reasons" : "why?"}
          </button>
        )}
      </div>

      {showReasons && b.sample_failed_reasons.length > 0 && (
        <ul className="mt-2 space-y-1">
          {b.sample_failed_reasons.map((r, i) => (
            <li
              key={i}
              className="text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1"
            >
              {r}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function BroadcastHistory() {
  const [rows, setRows] = useState<BroadcastRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/broadcast/history", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok || !body.ok) {
        setError(body?.error || `HTTP ${r.status}`);
        return;
      }
      setRows((body.broadcasts ?? []) as BroadcastRow[]);
      setDegraded(Boolean(body.degraded));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refetch when the composer reports a successful queue.
    const onSent = () => void load();
    window.addEventListener("broadcast:sent", onSent);
    return () => window.removeEventListener("broadcast:sent", onSent);
  }, [load]);

  return (
    <div className="max-w-4xl mt-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Broadcast history</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        What happened to recent sends. The runner processes enrolments every ~5
        min, so a fresh broadcast starts as <strong>pending</strong> and drains
        to <strong>sent</strong>. Hit Refresh to update.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm mb-3">
          Couldn&apos;t load history: {error}
        </div>
      )}
      {degraded && !error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-3">
          Showing partial data — some status counts may be incomplete.
        </div>
      )}

      {rows === null && !error ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows && rows.length === 0 ? (
        <p className="text-sm text-gray-400">
          No broadcasts sent yet. They&apos;ll appear here after your first send.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows?.map((b) => (
            <BroadcastCard key={b.id} b={b} />
          ))}
        </ul>
      )}
    </div>
  );
}
