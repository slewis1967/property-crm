"use client";

import { useEffect, useState } from "react";
import {
  FEEDBACK_TYPES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_STATUSES,
  type FeedbackItem,
  type FeedbackType,
  type FeedbackPriority,
  type FeedbackStatus,
} from "../../utils/feedback";

const statusMeta = (s: FeedbackStatus) => FEEDBACK_STATUSES.find((x) => x.value === s) ?? FEEDBACK_STATUSES[0];
const typeMeta = (t: FeedbackType) => FEEDBACK_TYPES.find((x) => x.value === t) ?? FEEDBACK_TYPES[2];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

export default function FeedbackClient({ submitter }: { submitter: string }) {
  // ── form state ──
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [area, setArea] = useState("");
  const [priority, setPriority] = useState<FeedbackPriority>("medium");
  const [submitting, setSubmitting] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── list state ──
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [filter, setFilter] = useState<"all" | "open">("open");

  // On mount: load existing items, then prefill "area" from the same-origin
  // referrer (the page the user came from). The referrer read is browser-only,
  // so it can't run during SSR/render — and both setState calls happen after an
  // await, which keeps them out of the synchronous effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/feedback", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) {
          setItems(json.items ?? []);
          setTableMissing(Boolean(json.tableMissing));
        }
      } catch { /* leave list empty */ }
      if (cancelled) return;
      setLoadingList(false);
      try {
        const ref = document.referrer;
        if (ref && new URL(ref).origin === window.location.origin) {
          const path = new URL(ref).pathname;
          if (path && path !== "/feedback") setArea(path);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim(),
          details: details.trim(),
          area: area.trim(),
          priority,
          page_url: area.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Could not send. Please try again.");
      } else {
        setItems((prev) => [json.item, ...prev]);
        setJustSent(true);
        setTitle(""); setDetails(""); setPriority("medium");
        setTimeout(() => setJustSent(false), 6000);
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    }
    setSubmitting(false);
  }

  async function updateStatus(id: string, status: FeedbackStatus) {
    const prev = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!json.ok) setItems(prev); // revert on failure
    } catch {
      setItems(prev);
    }
  }

  const visible = filter === "open"
    ? items.filter((i) => i.status !== "done" && i.status !== "wont_do")
    : items;

  const activeType = typeMeta(type);

  return (
    <div className="max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Feedback &amp; issues</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Spotted a bug, or got an idea to make the CRM better? Tell us here — it takes about 30 seconds.
        </p>
      </header>

      {tableMissing && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Feedback storage isn&apos;t set up in the database yet, so submissions can&apos;t be saved.
          Run <code className="font-mono">migrations/20260714_feedback.sql</code> in Supabase to enable it.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── Form ── */}
        <form onSubmit={submit} className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5 h-fit lg:sticky lg:top-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2">What&apos;s this about?</label>
          <div className="grid grid-cols-3 gap-2 mb-1">
            {FEEDBACK_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-medium transition ${
                  type === t.value
                    ? "border-[#0F4C5C] bg-[#0F4C5C]/5 text-[#0F4C5C] ring-1 ring-[#0F4C5C]"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <span className="text-xl">{t.emoji}</span>
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mb-4">{activeType.hint}</p>

          <label htmlFor="fb-title" className="block text-sm font-semibold text-gray-700 mb-1">
            Give it a short title
          </label>
          <input
            id="fb-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={140}
            placeholder={type === "bug" ? "e.g. Save button does nothing on the Fact Find" : "e.g. Let me email a report straight from the property page"}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/40"
            required
          />

          <label htmlFor="fb-details" className="block text-sm font-semibold text-gray-700 mb-1">
            Tell us more <span className="font-normal text-gray-400">(optional, but helps a lot)</span>
          </label>
          <textarea
            id="fb-details"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={5}
            placeholder={
              type === "bug"
                ? "What did you do, what happened, and what did you expect instead?"
                : "What would you like to do, and why would it help?"
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/40"
          />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label htmlFor="fb-area" className="block text-sm font-semibold text-gray-700 mb-1">
                Which page? <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="fb-area"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder="/fact-find"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/40"
              />
            </div>
            <div>
              <label htmlFor="fb-priority" className="block text-sm font-semibold text-gray-700 mb-1">
                How urgent?
              </label>
              <select
                id="fb-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as FeedbackPriority)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/40"
              >
                {FEEDBACK_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="w-full rounded-lg bg-[#0F4C5C] text-white font-semibold py-2.5 text-sm hover:bg-[#0d3f4c] disabled:opacity-50 transition"
          >
            {submitting ? "Sending…" : "Submit feedback"}
          </button>
          {justSent && (
            <p className="text-sm text-green-700 mt-3 text-center">
              ✓ Thanks — logged. It&apos;ll show in the list on the right.
            </p>
          )}
          {submitter && (
            <p className="text-[11px] text-gray-400 mt-3 text-center">Filing as {submitter}</p>
          )}
        </form>

        {/* ── List ── */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Logged so far</h2>
            <div className="flex gap-1 text-xs">
              {(["open", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-md font-medium ${
                    filter === f ? "bg-[#0F4C5C] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {f === "open" ? "Open" : "All"}
                </button>
              ))}
            </div>
          </div>

          {loadingList ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              {filter === "open" ? "Nothing open — nice." : "No feedback logged yet. Be the first!"}
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((i) => {
                const sm = statusMeta(i.status);
                const tm = typeMeta(i.type);
                return (
                  <li key={i.id} className="rounded-lg border border-gray-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-lg leading-none mt-0.5" title={tm.label}>{tm.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 text-sm">{i.title}</p>
                          <select
                            value={i.status}
                            onChange={(e) => updateStatus(i.id, e.target.value as FeedbackStatus)}
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold border-0 cursor-pointer ${sm.className}`}
                            title="Change status"
                          >
                            {FEEDBACK_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                        {i.details && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{i.details}</p>}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-400">
                          {i.priority === "high" && <span className="text-rose-500 font-semibold">High priority</span>}
                          {i.area && <span className="font-mono">{i.area}</span>}
                          {i.submitted_by && <span>{i.submitted_by}</span>}
                          <span>{fmtDate(i.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
