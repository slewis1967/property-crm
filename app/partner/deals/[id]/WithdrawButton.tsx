"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function WithdrawButton({ dealId }: { dealId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/partner/deals/${dealId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdraw" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Couldn't withdraw.");
      router.refresh();
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div className="text-right">
      {confirming ? (
        <div className="flex gap-2">
          <button onClick={withdraw} disabled={busy} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Withdrawing…" : "Yes, withdraw"}
          </button>
          <button onClick={() => setConfirming(false)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">Keep it</button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700">
          Withdraw request
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
