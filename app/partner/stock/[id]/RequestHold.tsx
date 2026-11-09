"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RequestHold({
  propertyId,
  clients,
  accent,
}: {
  propertyId: string;
  clients: { id: string; name: string }[];
  accent: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
        <div className="font-semibold text-gray-900">Request a hold</div>
        <p className="mt-1 text-gray-600">Add the buyer to your clients first.</p>
        <Link
          href={`/partner/clients/new?next=${encodeURIComponent(`/partner/stock/${propertyId}`)}`}
          className="mt-3 inline-block rounded-lg px-3 py-2 font-semibold text-white"
          style={{ background: accent }}
        >
          Add a client
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: propertyId, client_id: clientId, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Couldn't send the request.");
      router.push(`/partner/deals/${json.deal.id}`);
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
      <div className="font-semibold text-gray-900">Request a hold</div>
      <p className="mt-1 text-gray-600">We&apos;ll confirm with the developer and let you know, usually within one business day.</p>
      <label className="mt-3 block font-medium text-gray-700" htmlFor="client">For client</label>
      <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2">
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="mt-3 block font-medium text-gray-700" htmlFor="note">Note for us (optional)</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2" />
      {error && <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>}
      <button type="submit" disabled={busy || !clientId} className="mt-3 w-full rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
        {busy ? "Sending…" : "Request hold"}
      </button>
    </form>
  );
}
