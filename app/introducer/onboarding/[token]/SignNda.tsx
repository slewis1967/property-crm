"use client";

import { useState } from "react";

/**
 * Step one, made actionable.
 *
 * Before this existed the roadmap showed "Sign the confidentiality agreement"
 * as the current step and the page rendered nothing underneath it, because only
 * the ID upload was wired. An applicant was told to do something and given no
 * way to do it — which is exactly what happened to the first two people invited.
 *
 * Clicking asks the server for a signing link and goes there. The link is minted
 * per click and any previous one is retired, so a stale tab cannot leave a
 * second live route into the same agreement.
 */
export default function SignNda({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/introducer/onboarding/${encodeURIComponent(token)}/nda`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string; alreadyDone?: boolean };

      if (json.ok && json.url) {
        // Same tab: this is the applicant's one task right now, and signing in a
        // popup that a phone browser may block would strand them.
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
        Before we share the programme details with you, we both sign a mutual confidentiality
        agreement. It runs both ways: it covers what we tell you, and what you tell us.
      </p>
      <p className="mt-2 text-sm text-gray-600">
        You’ll read it in full on the next screen and sign it there. Nothing is committed until you do.
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
        {busy ? "Opening…" : "Read and sign the agreement"}
      </button>
    </div>
  );
}
