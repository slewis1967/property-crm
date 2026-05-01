"use client";

import { useState } from "react";

type Compliance = {
  severity: "clean" | "warn" | "block";
  violations: Array<{ type: string; snippet: string; why: string; fix: string }>;
  rewrite: string;
};

/**
 * Opt-in compliance check widget. Renders a small "Check compliance" button;
 * when clicked, runs /api/ai/compliance-check on the supplied text and shows
 * the result inline.
 *
 * Used on Quick Log + Document Extract previews where auto-running the check
 * would double the AI cost on internal-note flows. Smart Reply has its own
 * always-on integration (different cost/UX tradeoff: outbound text is
 * higher-stakes than internal notes).
 */
export default function AIComplianceCheck({
  text,
  channel,
  label = "Check compliance",
}: {
  text: string;
  channel?: "email" | "sms" | "social";
  label?: string;
}) {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "done"; result: Compliance }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const run = async () => {
    if (!text.trim()) return;
    setState({ phase: "checking" });
    try {
      const res = await fetch("/api/ai/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, channel }),
      });
      const json = await res.json();
      if (json.ok) {
        setState({
          phase: "done",
          result: {
            severity: json.severity,
            violations: json.violations || [],
            rewrite: json.rewrite || "",
          },
        });
      } else {
        setState({ phase: "error", error: json.error || "Check failed" });
      }
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Check failed" });
    }
  };

  if (state.phase === "idle") {
    return (
      <button
        type="button"
        onClick={run}
        disabled={!text.trim()}
        className="text-[11px] text-indigo-600 hover:text-indigo-800 hover:underline disabled:opacity-40"
      >
        🛡️ {label}
      </button>
    );
  }

  if (state.phase === "checking") {
    return <span className="text-[11px] text-gray-400 italic">checking compliance…</span>;
  }

  if (state.phase === "error") {
    return (
      <p className="text-[11px] text-amber-700 italic">
        Compliance check unavailable ({state.error}).
      </p>
    );
  }

  const { severity, violations, rewrite } = state.result;

  if (severity === "clean") {
    return (
      <p className="text-[11px] text-emerald-700 flex items-center gap-1.5">
        <span>✅</span>
        <span>Compliance check passed.</span>
      </p>
    );
  }

  const accent =
    severity === "block"
      ? "bg-red-50 border-red-200 text-red-900"
      : "bg-amber-50 border-amber-200 text-amber-900";
  const headerIcon = severity === "block" ? "⛔" : "⚠️";
  const headerLabel =
    severity === "block" ? "Compliance: blocking issues" : "Compliance: review before sending";

  return (
    <div className={`mt-1 border rounded-lg p-2.5 text-[11px] ${accent}`}>
      <p className="font-semibold uppercase tracking-wider text-[10px] mb-1.5">
        {headerIcon} {headerLabel}
      </p>
      <ul className="space-y-1">
        {violations.map((v, i) => (
          <li key={i}>
            <p className="font-medium">{v.type}</p>
            {v.snippet && <p className="italic mt-0.5">"{v.snippet}"</p>}
            <p className="mt-0.5 opacity-80">{v.why}</p>
            {v.fix && <p className="mt-0.5 opacity-90">→ {v.fix}</p>}
          </li>
        ))}
      </ul>
      {rewrite && (
        <p className="mt-2 pt-2 border-t border-current/20 italic opacity-80">
          A safer rewrite is available — copy from below or regenerate the source.
        </p>
      )}
    </div>
  );
}
