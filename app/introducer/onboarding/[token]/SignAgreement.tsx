"use client";

import { useState } from "react";

/**
 * The last step, made actionable.
 *
 * Before this existed the roadmap showed "Sign the introducer agreement" as the
 * current step and the page rendered nothing underneath it — the same dead end
 * step one had before SignNda was written, and it stranded two accredited
 * introducers who had been emailed "last step: your introducer agreement" and
 * given nowhere to take it.
 *
 * TWO DOCUMENTS, ONE BUTTON. The server hands back whichever of the referral
 * agreement and the commission schedule is still outstanding, so coming back
 * after signing the first lands on the second. The count is shown because
 * someone who thinks they have finished after one will not return for the
 * other.
 */
export default function SignAgreement({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/introducer/onboarding/${encodeURIComponent(token)}/agreement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
        alreadyDone?: boolean;
      };

      if (json.ok && json.url) {
        // Same tab: this is their one task right now, and signing in a popup
        // that a phone browser may block would strand them.
        window.location.href = json.url;
        return;
      }
      // Already signed elsewhere — reloading shows them the step they're really on.
      if (json.alreadyDone) {
        window.location.reload();
        return;
      }
      setError(json.error ?? "Could not open the agreement. Please try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-gray-600">
        There are two documents to sign: the <strong>Introducer Referral Agreement</strong>, which sets
        out the relationship, and the <strong>Commission Schedule</strong> that goes with it.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        You’ll read each one in full on screen and sign it there. We’ll bring up the second as soon as
        the first is done. Nothing is committed until you sign.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50"
        style={{ backgroundColor: "#020e40" }}
      >
        {busy ? "Opening…" : "Read and sign"}
      </button>
    </div>
  );
}
