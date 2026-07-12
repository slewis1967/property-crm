"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

type Compliance = {
  severity: "clean" | "warn" | "block";
  violations: Array<{ type: string; snippet: string; why: string; fix: string }>;
  rewrite: string;
};

export default function AISmartReply({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [direction, setDirection] = useState("");
  const [text, setText] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "ready" }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const [compliance, setCompliance] = useState<
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "done"; result: Compliance }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const generate = async () => {
    setState({ phase: "loading" });
    setCompliance({ phase: "idle" });
    try {
      const res = await fetch("/api/ai/smart-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          channel,
          direction: direction.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setText(json.text);
        setState({ phase: "ready" });
      } else {
        setState({ phase: "error", error: json.error || "Failed to draft reply" });
      }
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Failed to draft reply") });
    }
  };

  // Whenever a draft is ready (or edited), debounce a compliance check
  useEffect(() => {
    if (state.phase !== "ready" || !text.trim()) {
      queueMicrotask(() => setCompliance({ phase: "idle" }));
      return;
    }
    queueMicrotask(() => setCompliance({ phase: "checking" }));
    const handle = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/compliance-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, channel }),
        });
        const json = await res.json();
        if (json.ok) {
          setCompliance({
            phase: "done",
            result: {
              severity: json.severity,
              violations: json.violations || [],
              rewrite: json.rewrite || "",
            },
          });
        } else {
          setCompliance({ phase: "error", error: json.error || "Compliance check failed" });
        }
      } catch (e) {
        setCompliance({ phase: "error", error: errMessage(e, "Compliance check failed") });
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [text, channel, state.phase]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };

  const useRewrite = () => {
    if (compliance.phase === "done" && compliance.result.rewrite) {
      setText(compliance.result.rewrite);
    }
  };

  const blocked =
    compliance.phase === "done" && compliance.result.severity === "block";

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
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            rows={Math.min(20, Math.max(6, text.split("\n").length + 2))}
          />

          {/* Compliance banner */}
          <ComplianceBanner state={compliance} onUseRewrite={useRewrite} />

          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={copy}
              disabled={blocked}
              title={blocked ? "Resolve compliance issues before copying" : "Copy to clipboard"}
              className={`px-3 py-1.5 text-xs font-medium rounded transition ${
                blocked
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-gray-900 text-white hover:bg-gray-800"
              }`}
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

function ComplianceBanner({
  state,
  onUseRewrite,
}: {
  state:
    | { phase: "idle" }
    | { phase: "checking" }
    | { phase: "done"; result: Compliance }
    | { phase: "error"; error: string };
  onUseRewrite: () => void;
}) {
  if (state.phase === "idle") return null;

  if (state.phase === "checking") {
    return (
      <p className="text-[11px] text-gray-400 italic mt-2">Checking compliance…</p>
    );
  }
  if (state.phase === "error") {
    return (
      <p className="text-[11px] text-amber-700 italic mt-2">
        Compliance check unavailable ({state.error}). Send carefully.
      </p>
    );
  }

  const { severity, violations, rewrite } = state.result;
  if (severity === "clean") {
    return (
      <p className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1.5">
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
    <div className={`mt-2 border rounded-lg p-3 text-xs ${accent}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold uppercase tracking-wider text-[10px]">
          {headerIcon} {headerLabel}
        </span>
        {rewrite && (
          <button
            type="button"
            onClick={onUseRewrite}
            className="text-[11px] underline underline-offset-2 hover:no-underline font-medium"
          >
            Use suggested rewrite →
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {violations.map((v, i) => (
          <li key={i}>
            <p className="font-medium">{v.type}</p>
            {v.snippet && (
              <p className="text-[11px] italic mt-0.5">&quot;{v.snippet}&quot;</p>
            )}
            <p className="text-[11px] mt-0.5 opacity-80">{v.why}</p>
            {v.fix && (
              <p className="text-[11px] mt-0.5 opacity-90">→ {v.fix}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
