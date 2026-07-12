"use client";

import { useEffect, useState } from "react";
import AIComplianceCheck from "./AIComplianceCheck";
import { errMessage } from "../../utils/errors";

type Match = { property_id: string; summary: string; rationale: string };

export default function AIPropertyPitch({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [propertyId, setPropertyId] = useState<string>("");
  const [text, setText] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready" }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  // Pre-load match suggestions when the modal opens
  useEffect(() => {
    if (!open || matches.length > 0) return;
    queueMicrotask(() => setMatchesLoading(true));
    (async () => {
      try {
        const res = await fetch("/api/ai/contact-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        const json = await res.json();
        if (json.ok) {
          const ms = json.matches || [];
          setMatches(ms);
          if (ms.length > 0 && !propertyId) setPropertyId(ms[0].property_id);
        }
      } catch {
        /* matches load failed — user can still enter id manually */
      } finally {
        setMatchesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generate = async () => {
    if (!propertyId.trim()) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/property-pitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, propertyId: propertyId.trim(), channel }),
      });
      const json = await res.json();
      if (json.ok) {
        setText(json.text);
        setState({ phase: "ready" });
      } else {
        setState({ phase: "error", error: json.error || "Failed to generate pitch" });
      }
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Failed to generate pitch") });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-medium hover:bg-rose-700 transition"
      >
        🎯 Pitch a Property
      </button>
    );
  }

  return (
    <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
          🎯 Elvis · Property Pitch
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
                ? "bg-rose-600 text-white border-rose-600"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c === "email" ? "Email" : "SMS"}
          </button>
        ))}
      </div>

      {/* Property picker — uses AI match suggestions; advisor can also paste an id */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
          Property to pitch
        </p>
        {matchesLoading && (
          <p className="text-xs text-gray-400 italic">loading suggestions…</p>
        )}
        {matches.length > 0 && (
          <ul className="space-y-1 mb-2 max-h-40 overflow-y-auto">
            {matches.map((m) => (
              <li key={m.property_id}>
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="pitch-property"
                    checked={propertyId === m.property_id}
                    onChange={() => setPropertyId(m.property_id)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-gray-800">{m.summary}</span>
                    <br />
                    <span className="text-gray-500">{m.rationale}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <input
          type="text"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          placeholder="…or paste a property id"
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded font-mono focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
      </div>

      <button
        type="button"
        onClick={generate}
        disabled={state.phase === "loading" || !propertyId.trim()}
        className="px-3 py-1.5 bg-rose-600 text-white text-xs font-medium rounded hover:bg-rose-700 disabled:opacity-50 mb-3"
      >
        {state.phase === "loading" ? "Drafting…" : "Generate pitch"}
      </button>

      {state.phase === "loading" && (
        <div className="space-y-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-2.5 bg-rose-100/60 rounded animate-pulse"
              style={{ width: `${85 - i * 6}%` }}
            />
          ))}
        </div>
      )}

      {state.phase === "ready" && (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-y focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
            rows={Math.min(20, Math.max(6, text.split("\n").length + 2))}
          />
          <div className="mt-2">
            <AIComplianceCheck text={text} channel={channel} label="Check before sending" />
          </div>
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
        <p className="text-sm text-red-700 mt-2">⚠️ {state.error}</p>
      )}
    </div>
  );
}
