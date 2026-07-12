"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

type Diag = { stuck: boolean; diagnosis: string; unblock: string } | null;

export default function AIOpportunityDiagnosis({
  opportunityId,
}: {
  opportunityId: string;
}) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; diag: Diag }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/ai/diagnose-opportunity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opportunityId }),
        });
        const json = await res.json();
        if (json.ok) setState({ phase: "ready", diag: json.diagnosis });
        else setState({ phase: "error", error: json.error || "Unavailable" });
      } catch (e) {
        setState({ phase: "error", error: errMessage(e, "Unavailable") });
      }
    })();
  }, [opportunityId]);

  if (state.phase === "error") {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
        ⚠️ {state.error}
      </div>
    );
  }

  if (state.phase === "loading" || !state.diag) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="h-3 bg-gray-200 rounded animate-pulse w-3/4 mb-2" />
        <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
      </div>
    );
  }

  const { stuck, diagnosis, unblock } = state.diag;
  const accent = stuck
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-emerald-50 border-emerald-200 text-emerald-900";
  const icon = stuck ? "⚠️" : "✅";
  const label = stuck ? "Stuck" : "On track";

  return (
    <div className={`border rounded-lg p-3 ${accent}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-semibold uppercase tracking-wider">
          {icon} Elvis · {label}
        </span>
      </div>
      <p className="text-sm leading-relaxed">{diagnosis}</p>
      {stuck && unblock && (
        <p className="text-sm leading-relaxed mt-2 font-medium">
          → {unblock}
        </p>
      )}
    </div>
  );
}
