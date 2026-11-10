"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

export default function AISuburbBrief({
  suburb,
  state,
}: {
  suburb: string;
  state: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready"; text: string; cached: boolean }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const fetchBrief = async () => {
    setData({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/suburb-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suburb, state }),
      });
      const json = await res.json();
      if (json.ok) setData({ phase: "ready", text: json.text, cached: !!json.cached });
      else setData({ phase: "error", error: json.error || "Unavailable" });
    } catch (e) {
      setData({ phase: "error", error: errMessage(e, "Unavailable") });
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
        className="w-full mt-3 px-2 py-1.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
      >
        ✨ Elvis brief
      </button>
    );
  }

  return (
    <div className="mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold uppercase tracking-wider text-indigo-700 text-[10px]">
          ✨ {suburb} brief
        </span>
        <div className="flex items-center gap-2">
          {data.phase === "ready" && data.cached && (
            <span className="text-gray-400 text-[10px]">cached</span>
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-gray-400 hover:text-gray-700 text-[10px]"
          >
            close
          </button>
        </div>
      </div>
      {data.phase === "loading" && (
        <div className="space-y-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-2 bg-indigo-200/50 rounded animate-pulse" />
          ))}
        </div>
      )}
      {data.phase === "ready" && (
        <p className="whitespace-pre-wrap leading-relaxed text-gray-800">{data.text}</p>
      )}
      {data.phase === "error" && (
        <p className="text-red-700">⚠️ {data.error}</p>
      )}
    </div>
  );
}
