"use client";

import { useCallback, useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * Document-collection progress for a record (opportunity or contact).
 *
 * Shows, per applicant, how many of the YLA personal documents have been
 * uploaded via the portal — so the rep can see at a glance who still owes what
 * without leaving the opportunity/contact page. The "Request Documents" button
 * creates the requests; this panel tracks them.
 *
 * Reads the authed rep endpoints only:
 *   GET /api/document-requests?opportunity_id= | contact_id=   (the list)
 *   GET /api/document-requests/<id>                            (per-slot detail)
 *
 * Clients upload asynchronously, so a manual refresh is offered rather than
 * polling.
 */

type ListRow = {
  id: string;
  client_ref: string | null;
  applicant_name: string;
  status: string;
  drive_folder_url: string | null;
};

type Slot = {
  docKey: string;
  label: string;
  slot: number;
  document: { filename: string } | null;
};

type Detail = {
  received: number;
  total: number;
  complete: boolean;
  slots: Slot[];
};

type Row = ListRow & { detail?: Detail; detailError?: string };

function slotLabel(s: { label: string; docKey: string; slot: number }): string {
  let label = s.label;
  if (s.docKey === "photo_id") label += s.slot === 1 ? " (front)" : " (back)";
  else if (s.slot > 1 || s.docKey === "payslip") label += ` ${s.slot}`;
  return label;
}

export default function DocumentProgress({
  opportunityId,
  contactId,
}: {
  opportunityId?: string | null;
  contactId?: string | null;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = opportunityId
    ? `opportunity_id=${encodeURIComponent(opportunityId)}`
    : contactId
      ? `contact_id=${encodeURIComponent(contactId)}`
      : null;

  const load = useCallback(async () => {
    if (!query) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-requests?${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || `Failed to load (${res.status})`);
      }
      const list: ListRow[] = (json.requests || []).filter(
        (r: ListRow) => r.status !== "cancelled",
      );
      // Pull each request's per-slot completeness in parallel.
      const withDetail: Row[] = await Promise.all(
        list.map(async (r) => {
          try {
            const d = await fetch(`/api/document-requests/${r.id}`, { cache: "no-store" });
            const dj = await d.json();
            if (!d.ok || dj.ok === false) return { ...r, detailError: dj.error || "detail failed" };
            return { ...r, detail: dj as Detail };
          } catch (e) {
            return { ...r, detailError: errMessage(e) };
          }
        }),
      );
      setRows(withDetail);
    } catch (e) {
      setError(errMessage(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!query) return null;

  return (
    <div className="px-6 py-4 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Documents</p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="text-[11px] text-teal-700 hover:underline disabled:text-gray-300"
          title="Re-check for newly uploaded documents"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {loading && !rows && <p className="text-sm text-gray-400">Loading…</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rows && rows.length === 0 && !error && (
        <p className="text-sm text-gray-400">
          No documents requested yet. Use “Request Documents” above to send a secure upload link.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => {
            const d = r.detail;
            const received = d?.received ?? 0;
            const total = d?.total ?? 0;
            const pct = total > 0 ? Math.round((received / total) * 100) : 0;
            const complete = d?.complete ?? false;
            const submitted = r.status === "submitted";
            const outstanding = (d?.slots || []).filter((s) => !s.document);
            const barColor = submitted
              ? "bg-green-600"
              : complete
                ? "bg-green-500"
                : received > 0
                  ? "bg-amber-500"
                  : "bg-gray-300";
            return (
              <li key={r.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800 truncate" title={r.applicant_name}>
                    {r.applicant_name}
                    {r.client_ref && (
                      <span className="ml-1.5 text-[11px] font-normal text-gray-400">{r.client_ref}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-gray-500">
                    {r.detailError ? "—" : `${received}/${total}`}
                  </span>
                </div>

                {!r.detailError && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                )}

                <div className="mt-1 flex items-center justify-between gap-2">
                  <span
                    className={`text-[11px] font-medium ${
                      submitted ? "text-green-700" : complete ? "text-green-600" : "text-amber-700"
                    }`}
                  >
                    {submitted ? "Sent to Drive" : complete ? "Ready to submit" : "Awaiting client"}
                  </span>
                  {submitted && r.drive_folder_url && (
                    <a
                      href={r.drive_folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-medium text-blue-700 hover:underline shrink-0"
                    >
                      Open Drive ↗
                    </a>
                  )}
                </div>

                {!submitted && outstanding.length > 0 && (
                  <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                    Outstanding: {outstanding.map((s) => slotLabel(s)).join(", ")}
                  </p>
                )}

                {r.detailError && (
                  <p className="mt-1 text-[11px] text-red-500">Couldn’t load status.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
