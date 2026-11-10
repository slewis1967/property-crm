"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

type Broker = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  reference: string | null;
  notes: string | null;
  active: boolean;
};

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEAL = "#0F4C5C";

export default function BrokersEditor() {
  const [brokers, setBrokers] = useState<Broker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-new draft
  const [dName, setDName] = useState("");
  const [dEmail, setDEmail] = useState("");
  const [dCompany, setDCompany] = useState("");
  const [dRef, setDRef] = useState("");

  useEffect(() => {
    fetch("/api/settings/brokers")
      .then((r) => r.json())
      .then((j) => (j.ok ? setBrokers(j.brokers) : setError(j.error ?? "Load failed")))
      .catch((e) => setError(errMessage(e, "Load failed")));
  }, []);

  const persist = async (next: Broker[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/brokers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokers: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setBrokers(json.brokers);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const addBroker = () => {
    const name = dName.trim();
    const email = dEmail.trim();
    if (!name || !emailRe.test(email)) {
      setError("A broker needs a name and a valid email.");
      return;
    }
    const next: Broker[] = [
      ...(brokers ?? []),
      { id: crypto.randomUUID(), name, email, company: dCompany.trim() || null, reference: dRef.trim() || null, notes: null, active: true },
    ];
    setDName("");
    setDEmail("");
    setDCompany("");
    setDRef("");
    void persist(next);
  };

  const update = (id: string, patch: Partial<Broker>) => {
    if (!brokers) return;
    void persist(brokers.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const remove = (b: Broker) => {
    if (!brokers) return;
    if (!confirm(`Remove broker "${b.name}"?`)) return;
    void persist(brokers.filter((x) => x.id !== b.id));
  };

  if (!brokers && !error) return <p className="text-sm text-gray-400">Loading…</p>;

  return (
    <div>
      {error && <p className="mb-3 rounded bg-red-50 border border-red-200 p-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {(brokers ?? []).map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
            <input
              value={b.name}
              onChange={(e) => setBrokers((cur) => cur!.map((x) => (x.id === b.id ? { ...x, name: e.target.value } : x)))}
              onBlur={(e) => update(b.id, { name: e.target.value.trim() })}
              className="w-40 rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Broker name"
            />
            <input
              value={b.email}
              onChange={(e) => setBrokers((cur) => cur!.map((x) => (x.id === b.id ? { ...x, email: e.target.value } : x)))}
              onBlur={(e) => update(b.id, { email: e.target.value.trim() })}
              className="w-52 rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="email@broker.com"
            />
            <input
              value={b.company ?? ""}
              onChange={(e) => setBrokers((cur) => cur!.map((x) => (x.id === b.id ? { ...x, company: e.target.value } : x)))}
              onBlur={(e) => update(b.id, { company: e.target.value.trim() || null })}
              className="w-36 rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Company (optional)"
            />
            <input
              value={b.reference ?? ""}
              onChange={(e) => setBrokers((cur) => cur!.map((x) => (x.id === b.id ? { ...x, reference: e.target.value } : x)))}
              onBlur={(e) => update(b.id, { reference: e.target.value.trim() || null })}
              className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Ref / comp code"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={b.active} onChange={(e) => update(b.id, { active: e.target.checked })} />
              Active
            </label>
            <button type="button" onClick={() => remove(b)} className="ml-auto text-sm text-gray-400 hover:text-red-600">
              Remove
            </button>
          </div>
        ))}
        {brokers && brokers.length === 0 && <p className="text-sm text-gray-400">No brokers yet — add one below.</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-gray-300 p-2">
        <input value={dName} onChange={(e) => setDName(e.target.value)} placeholder="Broker name" className="w-40 rounded border border-gray-300 px-2 py-1 text-sm" />
        <input value={dEmail} onChange={(e) => setDEmail(e.target.value)} placeholder="email@broker.com" className="w-52 rounded border border-gray-300 px-2 py-1 text-sm" />
        <input value={dCompany} onChange={(e) => setDCompany(e.target.value)} placeholder="Company (optional)" className="w-36 rounded border border-gray-300 px-2 py-1 text-sm" />
        <input value={dRef} onChange={(e) => setDRef(e.target.value)} placeholder="Ref / comp code" className="w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
        <button
          type="button"
          onClick={addBroker}
          disabled={saving}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: TEAL }}
        >
          Add broker
        </button>
      </div>

      <div className="mt-2 h-4 text-xs">
        {saving && <span className="text-gray-400">Saving…</span>}
        {saved && !saving && <span className="text-green-600 font-medium">✓ Saved</span>}
      </div>
    </div>
  );
}
