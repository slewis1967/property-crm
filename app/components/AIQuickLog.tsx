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

type ApplyState = {
  summary: boolean;
  tags: boolean;
  temperature: boolean;
  status: boolean;
  followUp: boolean;
  taskIndexes: Set<number>;
};

const defaultApply = (e: Extraction): ApplyState => ({
  // Default to ON for the things the AI clearly extracted — advisor can untick.
  summary: !!e.summary,
  tags: e.tags.length > 0,
  temperature: !!e.temperature,
  status: !!e.status_change,
  followUp: e.follow_up_in_days != null,
  taskIndexes: new Set(e.tasks.map((_, i) => i)),
});

export default function AIQuickLog({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; extraction: Extraction; apply: ApplyState }
    | { phase: "applying" }
    | { phase: "done"; summary: any }
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
        const extraction = rest as Extraction;
        setState({ phase: "ready", extraction, apply: defaultApply(extraction) });
      } else {
        setState({ phase: "error", error: json.error || "Failed to extract" });
      }
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Failed to extract" });
    }
  };

  const apply = async () => {
    if (state.phase !== "ready") return;
    const { extraction, apply: a } = state;
    setState({ phase: "applying" });
    try {
      const res = await fetch("/api/ai/quick-log-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          payload: extraction,
          applied: {
            summary: a.summary,
            tags: a.tags,
            temperature: a.temperature,
            status: a.status,
            followUp: a.followUp,
            taskIndexes: Array.from(a.taskIndexes),
          },
        }),
      });
      const json = await res.json();
      if (json.ok) setState({ phase: "done", summary: json.applied });
      else setState({ phase: "error", error: json.error || "Failed to apply" });
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Failed to apply" });
    }
  };

  const reset = () => {
    setText("");
    setState({ phase: "idle" });
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

  // Helpers for mutating apply state inside the "ready" phase
  const setApply = (patch: Partial<ApplyState>) =>
    setState((prev) =>
      prev.phase === "ready" ? { ...prev, apply: { ...prev.apply, ...patch } } : prev,
    );
  const toggleTaskIdx = (i: number) =>
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const next = new Set(prev.apply.taskIndexes);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return { ...prev, apply: { ...prev.apply, taskIndexes: next } };
    });

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
            reset();
          }}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          close
        </button>
      </div>

      <p className="text-xs text-gray-500 mb-2">
        Type what just happened — Elvis turns it into a clean note + tasks + tags. Tick what
        you want applied, then hit Apply.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. called Sarah, she wants to see Carseldine townhouse, asked about depreciation, wants to do a 4pm call Wednesday"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 mb-3"
        rows={3}
        disabled={state.phase === "loading" || state.phase === "applying"}
      />

      {(state.phase === "idle" || state.phase === "loading") && (
        <button
          type="button"
          onClick={extract}
          disabled={state.phase === "loading" || !text.trim()}
          className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700 disabled:opacity-50"
        >
          {state.phase === "loading" ? "Extracting…" : "Extract actions"}
        </button>
      )}

      {state.phase === "ready" && (
        <div className="space-y-3">
          {state.extraction.summary && (
            <ApplyRow
              checked={state.apply.summary}
              onChange={(v) => setApply({ summary: v })}
              label="Save cleaned summary as a note"
            >
              <p className="text-sm text-gray-800">{state.extraction.summary}</p>
            </ApplyRow>
          )}

          {state.extraction.tasks.length > 0 && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Tasks ({state.apply.taskIndexes.size}/{state.extraction.tasks.length} selected)
              </p>
              <ul className="space-y-1">
                {state.extraction.tasks.map((t, i) => (
                  <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={state.apply.taskIndexes.has(i)}
                      onChange={() => toggleTaskIdx(i)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <span>{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-gray-500 ml-2">
                          due {String(t.due_date).slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.extraction.tags.length > 0 && (
            <ApplyRow
              checked={state.apply.tags}
              onChange={(v) => setApply({ tags: v })}
              label={`Add ${state.extraction.tags.length} tag${state.extraction.tags.length === 1 ? "" : "s"} to contact`}
            >
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
            </ApplyRow>
          )}

          {state.extraction.temperature && (
            <ApplyRow
              checked={state.apply.temperature}
              onChange={(v) => setApply({ temperature: v })}
              label={`Set temperature to ${state.extraction.temperature}`}
            />
          )}

          {state.extraction.status_change && (
            <ApplyRow
              checked={state.apply.status}
              onChange={(v) => setApply({ status: v })}
              label={`Set status to ${state.extraction.status_change}`}
            />
          )}

          {state.extraction.follow_up_in_days != null && (
            <ApplyRow
              checked={state.apply.followUp}
              onChange={(v) => setApply({ followUp: v })}
              label={`Create follow-up task in ${state.extraction.follow_up_in_days} days`}
            />
          )}

          {state.extraction.calendar && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                📅 Calendar suggestion (manual — Cal.com integration TBD)
              </p>
              <p className="text-sm text-gray-700">
                {state.extraction.calendar.title} · {state.extraction.calendar.when}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={apply}
              className="px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded hover:bg-purple-700"
            >
              Apply selected
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {state.phase === "applying" && (
        <p className="text-sm text-gray-500 italic mt-2">Applying…</p>
      )}

      {state.phase === "done" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm space-y-1">
          <p className="font-medium text-emerald-800">✓ Applied</p>
          <ul className="text-xs text-emerald-700 space-y-0.5">
            {state.summary.taskCount > 0 && <li>• Created {state.summary.taskCount} task{state.summary.taskCount === 1 ? "" : "s"}</li>}
            {state.summary.followUpCreated && <li>• Scheduled follow-up task</li>}
            {state.summary.tagsAdded > 0 && <li>• Added {state.summary.tagsAdded} tag{state.summary.tagsAdded === 1 ? "" : "s"} to contact</li>}
            {state.summary.temperatureSet && <li>• Updated temperature</li>}
            {state.summary.statusSet && <li>• Updated status</li>}
            {state.summary.summarySaved && <li>• Appended summary to contact notes</li>}
          </ul>
          <button
            type="button"
            onClick={reset}
            className="mt-2 text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            Log another
          </button>
        </div>
      )}

      {state.phase === "error" && (
        <p className="text-sm text-red-700 mt-2">⚠️ {state.error}</p>
      )}
    </div>
  );
}

function ApplyRow({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded p-3 border border-gray-100">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
          {children}
        </div>
      </label>
    </div>
  );
}
