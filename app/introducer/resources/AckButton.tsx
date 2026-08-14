"use client";

/**
 * "I've read this" — the only interactive thing on the resources page.
 *
 * Deliberately not optimistic. The confirmation is a record in an append-only
 * evidence table, so the tick appears when the server says the row exists and
 * not a moment before; a tick that turned out to be a failed write would be a
 * lie about a compliance obligation.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AckButton({
  resourceId,
  version,
}: {
  resourceId: string;
  version: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/introducer/resources/${resourceId}/ack`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "That didn’t save. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("That didn’t save — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={confirm}
        disabled={busy}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-gray-400 disabled:opacity-50"
      >
        {busy ? "Saving…" : `I’ve read version ${version}`}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </div>
  );
}
