"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardTitle, Icon, buttonPrimary, inputClass } from "../../ui";

export default function RequestHold({
  propertyId,
  clients,
}: {
  propertyId: string;
  clients: { id: string; name: string }[];
  /** Kept for callers; the colour now comes from --accent set by PortalShell. */
  accent?: string;
}) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (clients.length === 0) {
    return (
      <Card className="text-sm">
        <CardTitle icon="handshake">Request a hold</CardTitle>
        <p className="text-slate-600">Add the buyer to your clients first, then come back to request this lot for them.</p>
        <Link href={`/partner/clients/new?next=${encodeURIComponent(`/partner/stock/${propertyId}`)}`} className={`${buttonPrimary} mt-4 w-full`}>
          <Icon name="users" /> Add a client
        </Link>
      </Card>
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
    <Card className="text-sm ring-2 ring-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
      <form onSubmit={submit}>
        <CardTitle icon="handshake">Request a hold</CardTitle>
        <p className="text-slate-600">We&apos;ll confirm with the developer and let you know, usually within one business day.</p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="client">For client</label>
        <select id="client" value={clientId} onChange={(e) => setClientId(e.target.value)} className={`${inputClass} mt-1.5`}>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="note">Note for us (optional)</label>
        <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className={`${inputClass} mt-1.5`} />
        {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">{error}</div>}
        <button type="submit" disabled={busy || !clientId} className={`${buttonPrimary} mt-4 w-full`}>
          {busy ? "Sending…" : "Request hold"}
        </button>
      </form>
    </Card>
  );
}
