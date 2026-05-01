"use client";

import { useState } from "react";

type Extraction = {
  summary: string;
  tasks: Array<{ title: string; due_date: string | null }>;
  tags: string[];
  status_change: string | null;
  calendar: { title: string; when: string; with: string } | null;
  temperature: string | null;
  follow_up_in_days: number | null;
};

export default function AIQuickLog({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; extraction: Extraction }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const extract = async () => {
    if (!text.trim()) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/extract-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, noteText: text }),
      });
      const json = await res.json();
      if (json.ok) {
        const { ok, ...rest } = json;
        setState({ phase: "ready", extraction: rest as Extraction });
      } else {
        setState({ phase: "error", error: json.error || "Failed to extract" });
      }
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Failed to extract" });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition"
      >
        🎙️ Quick Log
      </button>
    );
  }

  return (
    <div className="bg-white border border-purple-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-700">
          🎙️ Elvis · Quick Log
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setText("");
            setState({ phase: "idle" });
          }}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          close
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Type what just happened — Elvis turns it into a clean note + tasks + tags.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. called Sarah, she wants to see Carseldine townhouse, asked about depreciation, wants to do a 4pm call Wednesday"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
        rows={3}
      />

      <button
        type="button"
        onClick={extract}
        disabled={state.phase === "loading" || !text.trim()}
        className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:opacity-50 mb-3"
      >
        {state.phase === "loading" ? "Extracting…" : "Extract actions"}
      </button>

      {state.phase === "ready" && (
        <div className="space-y-3">
          {state.extraction.summary && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Cleaned-up summary
              </p>
              <p className="text-sm text-gray-800">{state.extraction.summary}</p>
            </div>
          )}

          {state.extraction.tasks.length > 0 && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Suggested tasks ({state.extraction.tasks.length})
              </p>
              <ul className="space-y-1">
                {state.extraction.tasks.map((t, i) => (
                  <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
                    <input type="checkbox" defaultChecked className="mt-1" />
                    <div className="flex-1">
                      <span>{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-gray-500 ml-2">due {t.due_date}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.extraction.tags.length > 0 && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Suggested tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {state.extraction.tags.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(state.extraction.temperature || state.extraction.status_change) && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100 text-sm">
              {state.extraction.temperature && (
                <div>
                  Temperature: <strong>{state.extraction.temperature}</strong>
                </div>
              )}
              {state.extraction.status_change && (
                <div>
                  Status change: <strong>{state.extraction.status_change}</strong>
                </div>
              )}
            </div>
          )}

          {state.extraction.calendar && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Calendar suggestion
              </p>
              <p className="text-sm text-gray-800">
                📅 {state.extraction.calendar.title} · {state.extraction.calendar.when}
              </p>
            </div>
          )}

          {state.extraction.follow_up_in_days != null && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100 text-sm">
              Follow up in{" "}
              <strong>{state.extraction.follow_up_in_days} days</strong>
            </div>
          )}

          <p className="text-[11px] text-gray-400 italic">
            Review the extractions above. (Auto-applying tasks/tags to the database
            is not wired yet — review-only for now.)
          </p>
        </div>
      )}

      {state.phase === "error" && (
        <p className="text-sm text-red-700 mt-2">⚠️ {state.error}</p>
      )}
    </div>
  );
}
