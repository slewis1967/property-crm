"use client";

import { useEffect, useState } from "react";

export default function AIBrief({ contactId }: { contactId: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; text: string }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/contact-brief", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        const json = await res.json();
        if (json.ok) setState({ phase: "ready", text: json.text });
        else setState({ phase: "error", error: json.error || "AI brief unavailable" });
      } catch (e: any) {
        setState({ phase: "error", error: e?.message ?? "AI brief unavailable" });
      }
    })();
  }, [contactId]);

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-blue-50 border border-indigo-100 rounded-xl p-4 mb-6 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-700">
          ✨ Elvis · Brief
        </span>
        {state.phase === "loading" && (
          <span className="text-xs text-gray-400 italic">thinking…</span>
        )}
      </div>
      {state.phase === "loading" && (
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-2.5 bg-indigo-100/60 rounded animate-pulse"
              style={{ width: `${90 - i * 12}%` }}
            />
          ))}
        </div>
      )}
      {state.phase === "ready" && (
        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{state.text}</p>
      )}
      {state.phase === "error" && (
        <p className="text-xs text-red-600 italic">{state.error}</p>
      )}
    </div>
  );
}
