"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

export default function AISuggestedAction({ contactId }: { contactId: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; text: string }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  const fetchSuggestion = async () => {
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/suggest-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      });
      const json = await res.json();
      if (json.ok) setState({ phase: "ready", text: json.text });
      else setState({ phase: "error", error: json.error || "Unavailable" });
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Unavailable") });
    }
  };

  useEffect(() => {
    queueMicrotask(() => fetchSuggestion());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs">
      <span className="font-semibold">💡 Next move:</span>
      {state.phase === "loading" && (
        <span className="italic text-amber-600">thinking…</span>
      )}
      {state.phase === "ready" && <span>{state.text}</span>}
      {state.phase === "error" && (
        <span className="italic text-amber-600">{state.error}</span>
      )}
      {state.phase !== "loading" && (
        <button
          type="button"
          onClick={fetchSuggestion}
          className="ml-1 text-amber-700 hover:text-amber-900 underline-offset-2 hover:underline"
          title="Get another suggestion"
        >
          ↻
        </button>
      )}
    </div>
  );
}
