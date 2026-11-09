"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * "Resend signing links" for a Preliminary Assessment that is out for signature.
 * Goes only to applicants who have not signed. Asks first, because one press
 * emails clients and kills the links they already hold.
 */
export default function PaResendButton({ paId, className }: { paId: string; className?: string }) {
  const [state, setState] = useState<
    { phase: "idle" } | { phase: "sending" } | { phase: "done"; count: number } | { phase: "error"; error: string }
  >({ phase: "idle" });

  async function resend() {
    if (
      !window.confirm(
        "Email new signing links to everyone who has not signed yet? Their earlier links will stop working.",
      )
    ) {
      return;
    }
    setState({ phase: "sending" });
    try {
      const res = await fetch(`/api/preliminary-assessments/${paId}/resend`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || `Could not resend (${res.status})`);
      setState({ phase: "done", count: Array.isArray(data.sentTo) ? data.sentTo.length : 0 });
    } catch (err) {
      setState({ phase: "error", error: errMessage(err) });
    }
  }

  return (
    <span>
      <button
        type="button"
        onClick={() => void resend()}
        disabled={state.phase === "sending"}
        className={className ?? "text-sm font-semibold text-teal-800 hover:underline disabled:opacity-50"}
      >
        {state.phase === "sending" ? "Resending…" : "Resend signing links"}
      </button>
      {state.phase === "done" && (
        <span className="ml-2 text-xs text-green-700">
          ✓ New link sent to {state.count} {state.count === 1 ? "applicant" : "applicants"}
        </span>
      )}
      {state.phase === "error" && <span className="ml-2 text-xs text-red-600">{state.error}</span>}
    </span>
  );
}
