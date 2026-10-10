"use client";

/**
 * Help requests — where a super admin reviews guides that staff have asked
 * for. Each request shows the question, what the checks found, and the draft.
 * The draft can be edited before it is published; publishing is what makes it
 * appear in the "How do I do this?" panel for everyone.
 */
import { useEffect, useState } from "react";
import type { HelpDraft, HelpRequestRow, HelpRequestStatus } from "../../utils/help/requests";

const STATUS_LABEL: Record<HelpRequestStatus, string> = {
  new: "Not prepared yet",
  drafted: "Draft ready",
  refer: "Needs writing by hand",
  blocked: "Flagged by the checks",
  published: "Published",
  declined: "Declined",
};

const STATUS_STYLE: Record<HelpRequestStatus, string> = {
  new: "bg-gray-100 text-gray-700",
  drafted: "bg-emerald-50 text-emerald-700",
  refer: "bg-amber-50 text-amber-800",
  blocked: "bg-red-50 text-red-700",
  published: "bg-[#0F4C5C]/10 text-[#0F4C5C]",
  declined: "bg-gray-100 text-gray-500",
};

/** Steps are edited one per line, as "instruction | extra detail". */
function stepsToText(draft: HelpDraft | null): string {
  return (draft?.steps ?? []).map((s) => (s.detail ? `${s.title} | ${s.detail}` : s.title)).join("\n");
}

function textToSteps(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      const detail = rest.join("|").trim();
      return detail ? { title: title.trim(), detail } : { title: title.trim() };
    });
}

function RequestCard({ row, onChanged }: { row: HelpRequestRow; onChanged: (r: HelpRequestRow) => void }) {
  const [title, setTitle] = useState(row.draft?.title ?? "");
  const [summary, setSummary] = useState(row.draft?.summary ?? "");
  const [steps, setSteps] = useState(stepsToText(row.draft));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/help/requests/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not save");
      onChanged(json.item as HelpRequestRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const closed = row.status === "published" || row.status === "declined";
  const input = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{row.question}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {row.requested_by} · {new Date(row.created_at).toLocaleString("en-AU")}
            {row.section_label ? ` · asked from ${row.section_label}` : ""}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_STYLE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      {row.screen && (row.screen.reason || row.screen.concerns.length > 0) && (
        <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">What the checks found</div>
          {row.screen.reason && <p>{row.screen.reason}</p>}
          {row.screen.concerns.length > 0 && (
            <ul className="list-disc pl-5 mt-1 text-red-700">
              {row.screen.concerns.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {row.status === "declined" && row.decline_reason && (
        <p className="mt-3 text-sm text-gray-600">Declined: {row.decline_reason}</p>
      )}

      {row.status !== "declined" && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold text-gray-600">
            Guide title
            <input className={`${input} mt-1`} value={title} onChange={(e) => setTitle(e.target.value)} disabled={row.status === "published"} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            What it achieves
            <input className={`${input} mt-1`} value={summary} onChange={(e) => setSummary(e.target.value)} disabled={row.status === "published"} />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Steps, one per line. Add extra detail after a | sign.
            <textarea
              className={`${input} mt-1 font-mono`}
              rows={Math.max(4, steps.split("\n").length + 1)}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              disabled={row.status === "published"}
            />
          </label>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {row.status === "published" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => send({ action: "unpublish" })}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Take down
          </button>
        ) : (
          !closed && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => send({ action: "publish", draft: { title, summary, steps: textToSteps(steps) } })}
                className="px-3 py-1.5 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold hover:bg-[#0c3d4a] disabled:opacity-50"
              >
                Approve and publish
              </button>
              <input
                className="flex-1 min-w-[12rem] border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
                placeholder="Reason for declining (the requester sees this)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => send({ action: "decline", reason })}
                className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}

export default function HelpRequestsClient({ viewerIsSuperAdmin, rules }: { viewerIsSuperAdmin: boolean; rules: string[] }) {
  const [items, setItems] = useState<HelpRequestRow[] | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!viewerIsSuperAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/help/requests?all=1", { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) throw new Error(json.error || "Could not load requests");
        setUnavailable(Boolean(json.unavailable));
        setItems(json.items as HelpRequestRow[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load requests");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerIsSuperAdmin]);

  const changed = (r: HelpRequestRow) => setItems((prev) => (prev ?? []).map((x) => (x.id === r.id ? r : x)));
  const waiting = (items ?? []).filter((r) => r.status !== "published" && r.status !== "declined");
  const done = (items ?? []).filter((r) => r.status === "published" || r.status === "declined");

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-bold text-[#0F4C5C]">Help requests</h1>
      <p className="text-sm text-gray-600 mt-1">
        Guides that staff have asked for from the “How do I do this?” button. Nothing reaches other staff until it is
        approved here.
      </p>

      {!viewerIsSuperAdmin ? (
        <p className="mt-6 text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-4">
          Only a super admin can review requests. Your own requests, and whether they were approved, are listed in the
          “How do I do this?” panel.
        </p>
      ) : (
        <>
          <details className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
            <summary className="text-sm font-semibold text-gray-900 cursor-pointer">
              What a guide must never do ({rules.length} rules)
            </summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-sm text-gray-700">
              {rules.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          </details>

          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
          {unavailable && (
            <p className="mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-4">
              Asking for a guide is not switched on yet.
            </p>
          )}
          {items === null && !error && <p className="mt-4 text-sm text-gray-500">Loading…</p>}

          {items !== null && (
            <>
              <h2 className="mt-6 mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                Waiting for you ({waiting.length})
              </h2>
              <div className="space-y-3">
                {waiting.length === 0 && <p className="text-sm text-gray-500">Nothing is waiting.</p>}
                {waiting.map((r) => (
                  <RequestCard key={r.id} row={r} onChanged={changed} />
                ))}
              </div>

              <h2 className="mt-8 mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">
                Already decided ({done.length})
              </h2>
              <div className="space-y-3">
                {done.map((r) => (
                  <RequestCard key={`${r.id}-${r.status}`} row={r} onChanged={changed} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
