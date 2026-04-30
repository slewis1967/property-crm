"use client";

import { useState } from "react";

export default function AISmartReply({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [direction, setDirection] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; text: string }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const generate = async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, channel, direction: direction.trim() || undefined }),
      });
      const json = await res.json();
      if (json.ok) setState({ phase: "ready", text: json.text });
      else setState({ phase: "error", error: json.error || "Failed to draft reply" });
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Failed to draft reply" });
    }
  };

  const copy = async () => {
    if (state.phase === "ready") {
      try {
        await navigator.clipboard.writeText(state.text);
      } catch {
        /* clipboard unavailable */
      }
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 transition"
      >
        ✨ Smart Reply
      </button>
    );
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
          ✨ Elvis · Smart Reply
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          close
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        {(["email", "sms"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setChannel(c)}
            className={`px-3 py-1 rounded text-xs font-medium border ${
              channel === c
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c === "email" ? "Email" : "SMS"}
          </button>
        ))}
      </div>

      <textarea
        value={direction}
        onChange={(e) => setDirection(e.target.value)}
        placeholder="Optional: tell Elvis what to say (e.g. 'send the Springfield Lakes brochure and propose a Tuesday call')"
        className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-3"
        rows={2}
      />

      <button
        type="button"
        onClick={generate}
        disabled={state.phase === "loading"}
        className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700 disabled:opacity-50 mb-3"
      >
        {state.phase === "loading" ? "Drafting…" : "Generate"}
      </button>

      {state.phase === "loading" && (
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-2.5 bg-indigo-100/60 rounded animate-pulse"
              style={{ width: `${85 - i * 8}%` }}
            />
          ))}
        </div>
      )}

      {state.phase === "ready" && (
        <div>
          <textarea
            value={state.text}
            onChange={(e) => setState({ phase: "ready", text: e.target.value })}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            rows={Math.min(20, Math.max(6, state.text.split("\n").length + 2))}
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={copy}
              className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-800"
            >
              📋 Copy
            </button>
            <button
              type="button"
              onClick={generate}
              className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
            >
              ↻ Regenerate
            </button>
          </div>
        </div>
      )}

      {state.phase === "error" && (
        <p className="text-sm text-red-700">⚠️ {state.error}</p>
      )}
    </div>
  );
}
