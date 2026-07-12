"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { errMessage } from "../../utils/errors";

type Match = { contact_id: string; name: string; rationale: string };

export default function AIPropertyMatches({ propertyId }: { propertyId: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; matches: Match[]; cached: boolean }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/property-matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ propertyId }),
        });
        const json = await res.json();
        if (json.ok)
          setState({ phase: "ready", matches: json.matches || [], cached: !!json.cached });
        else setState({ phase: "error", error: json.error || "Unavailable" });
      } catch (e) {
        setState({ phase: "error", error: errMessage(e, "Unavailable") });
      }
    })();
  }, [propertyId]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          👥 Contacts that fit this property
        </h3>
        {state.phase === "loading" && (
          <span className="text-xs text-gray-400 italic">matching…</span>
        )}
        {state.phase === "ready" && state.cached && (
          <span className="text-[10px] text-gray-400">cached</span>
        )}
      </div>
      {state.phase === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-gray-50 rounded animate-pulse" />
          ))}
        </div>
      )}
      {state.phase === "ready" && state.matches.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          No clear contact matches in current pipeline.
        </p>
      )}
      {state.phase === "ready" && state.matches.length > 0 && (
        <ul className="space-y-2">
          {state.matches.map((m, i) => (
            <li
              key={m.contact_id || i}
              className="border-b border-gray-50 pb-2 last:border-0 last:pb-0"
            >
              <Link
                href={`/contacts/${m.contact_id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                {m.name}
              </Link>
              <p className="text-xs text-gray-600 mt-0.5">{m.rationale}</p>
            </li>
          ))}
        </ul>
      )}
      {state.phase === "error" && (
        <p className="text-xs text-red-600 italic">{state.error}</p>
      )}
    </div>
  );
}
