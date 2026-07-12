"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

export default function AIDashboardBrief() {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; text: string }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/dashboard-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const json = await res.json();
        if (json.ok) setState({ phase: "ready", text: json.text });
        else setState({ phase: "error", error: json.error || "AI brief unavailable" });
      } catch (e) {
        setState({ phase: "error", error: errMessage(e, "AI brief unavailable") });
      }
    })();
  }, []);

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 rounded-xl p-5 mb-6 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
          ✨ Elvis · Today&apos;s brief
        </span>
        {state.phase === "loading" && (
          <span className="text-xs text-gray-400 italic">thinking…</span>
        )}
      </div>
      {state.phase === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-3 bg-indigo-100/60 rounded animate-pulse"
              style={{ width: `${85 - i * 10}%` }}
            />
          ))}
        </div>
      )}
      {state.phase === "ready" && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{state.text}</p>
      )}
      {state.phase === "error" && (
        <p className="text-sm text-red-700">⚠️ {state.error}</p>
      )}
    </div>
  );
}
