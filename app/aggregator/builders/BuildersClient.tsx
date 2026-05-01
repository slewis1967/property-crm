"use client";

import { useEffect, useState } from "react";

type Builder = {
  id: string;
  canonical_name: string;
  aliases: string[];
  sender_domains: string[];
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  draft: boolean;
  created_at: string;
};

export default function BuildersClient() {
  const [builders, setBuilders] = useState<Builder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Builder>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setBuilders(null);
    setError(null);
    try {
      const res = await fetch("/api/aggregator/builders");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setBuilders(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (b: Builder) => {
    setEditingId(b.id);
    setEdit({ ...b });
  };

  const save = async () => {
    if (!editingId) return;
    setBusy(editingId);
    try {
      const res = await fetch(`/api/aggregator/builders/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: edit.canonical_name,
          aliases: edit.aliases ?? [],
          sender_domains: edit.sender_domains ?? [],
          contact_email: edit.contact_email,
          contact_phone: edit.contact_phone,
          active: edit.active ?? true,
          draft: false,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setEditingId(null);
      await load();
    } catch (e: any) {
      alert(`Save failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (b: Builder) => {
    setBusy(b.id);
    try {
      await fetch(`/api/aggregator/builders/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !b.active }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;
  if (builders === null) return <div className="text-gray-500 p-4 italic">Loading…</div>;

  return (
    <div className="space-y-4">
      {builders.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
          No builders detected yet. They get auto-created when emails arrive at the stocklist@ inbox.
        </div>
      )}

      {builders.map((b) => {
        const isEditing = editingId === b.id;
        const isBusy = busy === b.id;
        return (
          <div
            key={b.id}
            className={`bg-white border rounded-xl p-4 shadow-sm ${b.draft ? "border-amber-300" : "border-gray-200"}`}
          >
            {!isEditing ? (
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-gray-800">
                      {b.canonical_name}
                    </h3>
                    {b.draft && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
                        DRAFT — needs review
                      </span>
                    )}
                    {!b.active && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Sender domains</p>
                      <p className="text-gray-700 font-mono">
                        {(b.sender_domains ?? []).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Aliases</p>
                      <p className="text-gray-700">
                        {(b.aliases ?? []).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Contact email</p>
                      <p className="text-gray-700">{b.contact_email ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Contact phone</p>
                      <p className="text-gray-700">{b.contact_phone ?? "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(b)}
                    disabled={isBusy}
                    className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {b.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Canonical name"
                    value={edit.canonical_name ?? ""}
                    onChange={(v) => setEdit({ ...edit, canonical_name: v })}
                  />
                  <Field
                    label="Contact email"
                    value={edit.contact_email ?? ""}
                    onChange={(v) => setEdit({ ...edit, contact_email: v })}
                  />
                  <Field
                    label="Sender domains (comma-separated)"
                    value={(edit.sender_domains ?? []).join(", ")}
                    onChange={(v) =>
                      setEdit({
                        ...edit,
                        sender_domains: v.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  <Field
                    label="Aliases (comma-separated)"
                    value={(edit.aliases ?? []).join(", ")}
                    onChange={(v) =>
                      setEdit({
                        ...edit,
                        aliases: v.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  <Field
                    label="Contact phone"
                    value={edit.contact_phone ?? ""}
                    onChange={(v) => setEdit({ ...edit, contact_phone: v })}
                  />
                  <label className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      checked={edit.active ?? true}
                      onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={save}
                    disabled={isBusy}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="font-medium text-gray-600 mb-0.5 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}
