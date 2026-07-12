"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

export default function AIPreMeetingBrief({ appointmentId }: { appointmentId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; text: string; cached: boolean }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const fetchBrief = async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/pre-meeting-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      const json = await res.json();
      if (json.ok) setState({ phase: "ready", text: json.text, cached: !!json.cached });
      else setState({ phase: "error", error: json.error || "Unavailable" });
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Unavailable") });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          fetchBrief();
        }}
        className="px-2 py-1 rounded text-[10px] font-medium bg-indigo-600 text-white hover:bg-indigo-700"
      >
        ✨ Brief
      </button>
    );
  }

  return (
    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold uppercase tracking-wider text-indigo-700 text-[10px]">
          ✨ Pre-meeting brief
        </span>
        <div className="flex items-center gap-2">
          {state.phase === "ready" && state.cached && (
            <span className="text-gray-400">cached</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700"
          >
            close
          </button>
        </div>
      </div>
      {state.phase === "loading" && (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-2 bg-indigo-200/50 rounded animate-pulse" />
          ))}
        </div>
      )}
      {state.phase === "ready" && (
        <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{state.text}</p>
      )}
      {state.phase === "error" && (
        <p className="text-red-700">⚠️ {state.error}</p>
      )}
    </div>
  );
}
