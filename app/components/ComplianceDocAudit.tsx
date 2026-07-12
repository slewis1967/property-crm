"use client";

/**
 * Shared sign-lock UI for the three compliance documents (Borrower Fact Find,
 * NCCP Needs Analysis, Credit File Authorisation).
 *
 *  - <LockedBanner>  a read-only banner shown when the document is at its
 *    terminal (signed/complete) status, with a "Reopen to amend" button. The
 *    reopen itself is recorded in the audit log by the API.
 *  - <HistoryPanel>  a collapsible panel that fetches and lists the audit trail
 *    (who / when / action / status) from the document's /history endpoint.
 *
 * Both are screen-only (`no-print`) so they never appear on the printed/exported
 * document. Styling matches the existing amber/teal form chrome.
 */

import { useCallback, useState } from "react";

const TEAL = "#0F4C5C";

/** One audit row as returned by the /history endpoints (no PII snapshot). */
export type AuditRow = {
  id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  status_after: string | null;
  note: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Edited",
  sign: "Signed / completed",
  reopen: "Reopened",
  delete: "Deleted",
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read-only banner for a locked document. `onReopen` should PATCH the status
 * back to an editable value (the API records that as a "reopen").
 */
export function LockedBanner({ onReopen, busy }: { onReopen: () => void; busy?: boolean }) {
  return (
    <div className="no-print mx-4 mt-4 p-4 rounded-lg bg-amber-50 border border-amber-300 flex items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-amber-900">🔒 Signed — locked (read-only)</p>
        <p className="text-xs text-amber-800 mt-1">
          This document has been signed/completed and can&apos;t be edited. Reopen it to make amendments — the
          change is recorded in the history log.
        </p>
      </div>
      <button
        onClick={onReopen}
        disabled={busy}
        className="shrink-0 px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
        style={{ borderColor: TEAL, color: TEAL }}
      >
        {busy ? "Reopening…" : "Reopen to amend"}
      </button>
    </div>
  );
}

/**
 * Collapsible audit-trail panel. Fetches lazily on first open from
 * `${apiBase}/${id}/history` (e.g. apiBase="/api/fact-finds").
 */
export function HistoryPanel({ apiBase, id }: { apiBase: string; id: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/${id}/history`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load history");
      setRows(json.history ?? []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  }, [apiBase, id]);

  // Fetch lazily on the first open, from the click handler (not an effect) so we
  // don't setState during render.
  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) void load();
  }, [open, loaded, loading, load]);

  return (
    <div className="no-print mx-4 my-4">
      <button
        onClick={toggle}
        className="text-sm font-semibold hover:underline"
        style={{ color: TEAL }}
      >
        {open ? "▾ Hide change history" : "▸ Change history"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
          {loading && <p className="text-sm text-gray-500">Loading history…</p>}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="text-sm text-gray-500">
              No history recorded yet. (Audit logging activates once the compliance-audit migration is applied.)
            </p>
          )}
          {!loading && !error && rows.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {rows.map((r) => (
                <li key={r.id} className="py-2 flex items-baseline justify-between gap-3 text-sm">
                  <div>
                    <span className="font-semibold text-gray-800">{ACTION_LABEL[r.action] ?? r.action}</span>
                    {r.status_after && <span className="text-gray-500"> → {r.status_after}</span>}
                    <span className="text-gray-500"> by {r.changed_by || "unknown"}</span>
                    {r.note && <span className="text-gray-400"> — {r.note}</span>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400 tabular-nums">{fmtWhen(r.changed_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
