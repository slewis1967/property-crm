"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ClientView } from "../../api/partner/_shared";

const STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];

export default function ClientForm({
  mode,
  client,
  next,
  accent,
}: {
  mode: "create" | "edit";
  client?: ClientView;
  next?: string | null;
  accent: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    first_name: client?.firstName ?? "",
    last_name: client?.lastName ?? "",
    email: client?.email ?? "",
    phone: client?.phone ?? "",
    state: client?.state ?? "",
    budget_max: client?.budgetMax ? String(client.budgetMax) : "",
    notes: client?.notes ?? "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(mode === "create" ? "/api/partner/clients" : `/api/partner/clients/${client?.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ...(mode === "create" ? { consent } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Couldn't save.");
      if (mode === "create") {
        router.push(next ?? `/partner/clients/${json.client.id}`);
      } else {
        setSaved(true);
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm text-gray-900";
  const label = "block text-sm font-medium text-gray-700";

  return (
    <form onSubmit={submit} className="max-w-2xl rounded-xl border border-gray-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={label} htmlFor="fn">First name</label><input id="fn" required className={input} value={form.first_name} onChange={set("first_name")} /></div>
        <div><label className={label} htmlFor="ln">Last name</label><input id="ln" className={input} value={form.last_name} onChange={set("last_name")} /></div>
        <div><label className={label} htmlFor="em">Email</label><input id="em" type="email" className={input} value={form.email} onChange={set("email")} /></div>
        <div><label className={label} htmlFor="ph">Phone</label><input id="ph" className={input} value={form.phone} onChange={set("phone")} /></div>
        <div>
          <label className={label} htmlFor="st">State they&apos;re buying in</label>
          <select id="st" className={input} value={form.state} onChange={set("state")}>
            <option value="">—</option>
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div><label className={label} htmlFor="bm">Budget (up to)</label><input id="bm" inputMode="numeric" className={input} value={form.budget_max} onChange={set("budget_max")} placeholder="750000" /></div>
      </div>
      <div className="mt-4"><label className={label} htmlFor="nt">Notes</label><textarea id="nt" rows={3} className={input} value={form.notes} onChange={set("notes")} maxLength={2000} /></div>
      <p className="mt-2 text-xs text-gray-500">An email or a phone number is required.</p>

      {mode === "create" && (
        <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>My client has agreed to me passing their details to NextKey so it can arrange a property purchase with them.</span>
        </label>
      )}

      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      {saved && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">Saved.</div>}

      <button type="submit" disabled={busy || (mode === "create" && !consent)} className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
        {busy ? "Saving…" : mode === "create" ? "Add client" : "Save changes"}
      </button>
    </form>
  );
}
