"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AcceptForm({
  version,
  defaultName,
  defaultAbn,
  email,
  accent,
}: {
  version: string;
  defaultName: string;
  defaultAbn: string;
  email: string;
  accent: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ signerName: defaultName, signerTitle: "", entityName: "", abn: defaultAbn });
  const [readAgreement, setRead] = useState(false);
  const [hasAuthority, setAuthority] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/agreement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, version, readAgreement, hasAuthority }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Couldn't record your acceptance.");
      router.push("/partner/stock");
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="mt-6 max-w-2xl space-y-4 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-5">
      <h2 className="text-lg font-semibold text-slate-900">Accept for your firm</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Your full name
          <input className={input} value={form.signerName} onChange={set("signerName")} required autoComplete="name" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Your position
          <input className={input} value={form.signerTitle} onChange={set("signerTitle")} placeholder="Director" required autoComplete="organization-title" />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Firm&apos;s legal entity name
          <input className={input} value={form.entityName} onChange={set("entityName")} placeholder="Example Advisory Pty Ltd" required autoComplete="organization" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          ABN
          <input className={input} value={form.abn} onChange={set("abn")} inputMode="numeric" placeholder="12 345 678 901" required />
        </label>
        <div className="block text-sm text-slate-600">
          Notices to your firm go to <strong>{email}</strong>.
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={readAgreement} onChange={(e) => setRead(e.target.checked)} />
        <span>I have read the NextKey Channel Partner Agreement ({version}) above.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" className="mt-1" checked={hasAuthority} onChange={(e) => setAuthority(e.target.checked)} />
        <span>
          I am authorised to sign for the firm named above, and on its behalf I accept the agreement. I understand that
          accepting here is signing it electronically.
        </span>
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={busy || !readAgreement || !hasAuthority}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? "Recording…" : "Accept and sign"}
      </button>
    </form>
  );
}
