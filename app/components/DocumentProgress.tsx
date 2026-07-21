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
 * BOTH applicants of a joint application are shown:
 *  - Each applicant with a request appears with their upload progress. A joint
 *    application's per-applicant requests share an application_id, so we gather
 *    the siblings by application_id (applicant 2's request has no contact_id, so
 *    a contact-scoped list alone would miss it).
 *  - A co-applicant who is on file (a linked contact, or applicant 2 captured in
 *    the Fact Find / Needs Analysis) but has NOT been sent a link yet appears as
 *    a muted "no link sent yet" row, so the rep sees the whole household.
 *
 * Reads the authed rep endpoints only:
 *   GET /api/document-requests?opportunity_id= | contact_id= | application_id=
 *   GET /api/document-requests/<id>                      (per-slot detail)
 *   GET /api/document-requests/prefill?contact_id=        (co-applicant from FF/NA)
 *
 * Clients upload asynchronously, so a manual refresh is offered rather than
 * polling.
 */

type ListRow = {
  id: string;
  client_ref: string | null;
  application_id: string | null;
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

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

async function getJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || (json as { ok?: boolean }).ok === false) {
    throw new Error((json as { error?: string }).error || `Failed (${res.status})`);
  }
  return json as Record<string, unknown>;
}

export default function DocumentProgress({
  opportunityId,
  contactId,
  applicant2Name,
}: {
  opportunityId?: string | null;
  contactId?: string | null;
  /** Co-applicant already known to the caller (e.g. a linked contact). */
  applicant2Name?: string | null;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [pending, setPending] = useState<{ name: string }[]>([]);
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
      // 1. The record's requests, plus any joint-application siblings (shared
      //    application_id) that the opp/contact filter wouldn't return on its own.
      const base = ((await getJson(`/api/document-requests?${query}`)).requests as ListRow[]) || [];
      const byId = new Map<string, ListRow>();
      for (const r of base) byId.set(r.id, r);
      const appIds = [...new Set(base.map((r) => r.application_id).filter(Boolean))] as string[];
      await Promise.all(
        appIds.map(async (appId) => {
          try {
            const sibs =
              ((await getJson(`/api/document-requests?application_id=${encodeURIComponent(appId)}`))
                .requests as ListRow[]) || [];
            for (const s of sibs) if (!byId.has(s.id)) byId.set(s.id, s);
          } catch {
            /* best-effort */
          }
        }),
      );

      const list = [...byId.values()].filter((r) => r.status !== "cancelled");

      // 2. Each request's per-slot completeness, in parallel.
      const withDetail: Row[] = await Promise.all(
        list.map(async (r) => {
          try {
            const dj = await getJson(`/api/document-requests/${r.id}`);
            return { ...r, detail: dj as unknown as Detail };
          } catch (e) {
            return { ...r, detailError: errMessage(e) };
          }
        }),
      );
      // Primary (earliest) first — the list endpoint sorts newest-first.
      withDetail.reverse();

      // 3. A co-applicant on file (linked contact, or applicant 2 from FF/NA) who
      //    has no request yet, so both applicants are visible either way.
      const known = new Set(withDetail.map((r) => normName(r.applicant_name)));
      const coApplicants: { name: string }[] = [];
      if (applicant2Name && applicant2Name.trim()) {
        coApplicants.push({ name: applicant2Name.trim() });
      } else if (contactId) {
        try {
          const pf = await getJson(
            `/api/document-requests/prefill?contact_id=${encodeURIComponent(contactId)}`,
          );
          const n = (pf.applicant2_name as string | null) || null;
          if (n && n.trim()) coApplicants.push({ name: n.trim() });
        } catch {
          /* prefill is best-effort */
        }
      }
      const stillPending = coApplicants.filter((c) => !known.has(normName(c.name)));

      setRows(withDetail);
      setPending(stillPending);
    } catch (e) {
      setError(errMessage(e));
      setRows([]);
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, [query, contactId, applicant2Name]);

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

  const nothing = rows && rows.length === 0 && pending.length === 0;

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

      {nothing && !error && (
        <p className="text-sm text-gray-400">
          No documents requested yet. Use “Request Documents” above to send a secure upload link.
        </p>
      )}

      {rows && (rows.length > 0 || pending.length > 0) && (
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

          {/* Co-applicant(s) on file who haven't been sent an upload link yet. */}
          {pending.map((p, i) => (
            <li key={`pending-${i}`} className="opacity-90">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-600 truncate" title={p.name}>
                  {p.name}
                </span>
                <span className="shrink-0 text-[11px] font-medium text-gray-400">2nd applicant</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-gray-200" style={{ width: "0%" }} />
              </div>
              <p className="mt-1 text-[11px] text-gray-400 leading-snug">
                No upload link sent yet — use “Request Documents” above.
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
