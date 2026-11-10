"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

type PropertyType = {
  name: string;
  icon?: string | null;
  description?: string | null;
};

export default function PropertyTypesEditor() {
  const [types, setTypes] = useState<PropertyType[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftIcon, setDraftIcon] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");

  useEffect(() => {
    fetch("/api/settings/property-types")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setTypes(j.types);
        else setError(j.error ?? "Load failed");
      })
      .catch((e) => setError(e?.message ?? "Load failed"));
  }, []);

  const persist = async (next: PropertyType[]) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/property-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ types: next }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setTypes(json.types);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(errMessage(e, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = (idx: number) => {
    if (!types) return;
    if (!confirm(`Remove "${types[idx].name}"?`)) return;
    const next = types.filter((_, i) => i !== idx);
    persist(next);
  };

  const updateField = (idx: number, key: keyof PropertyType, value: string) => {
    if (!types) return;
    const next = [...types];
    next[idx] = { ...next[idx], [key]: value };
    setTypes(next);
  };

  const commitEdit = () => {
    if (types) persist(types);
  };

  const addType = () => {
    const name = draftName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (types?.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError(`"${name}" is already in the list`);
      return;
    }
    const next: PropertyType[] = [
      ...(types ?? []),
      {
        name,
        icon: draftIcon.trim() || null,
        description: draftDesc.trim() || null,
      },
    ];
    persist(next);
    setDraftIcon("");
    setDraftName("");
    setDraftDesc("");
  };

  if (types === null) {
    return <p className="text-xs text-gray-400">Loading…</p>;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {saved && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700">
          ✓ Saved
        </div>
      )}

      <div className="space-y-2 mb-5">
        {types.map((t, i) => (
          <div
            key={`${t.name}-${i}`}
            className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg"
          >
            <input
              type="text"
              value={t.icon ?? ""}
              onChange={(e) => updateField(i, "icon", e.target.value)}
              onBlur={commitEdit}
              maxLength={4}
              placeholder="🏡"
              className="w-12 px-2 py-1 text-center text-base bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="text"
              value={t.name}
              onChange={(e) => updateField(i, "name", e.target.value)}
              onBlur={commitEdit}
              className="w-48 px-2 py-1 text-sm font-semibold bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <input
              type="text"
              value={t.description ?? ""}
              onChange={(e) => updateField(i, "description", e.target.value)}
              onBlur={commitEdit}
              placeholder="Optional description (helps the AI extractor classify accurately)"
              className="flex-1 px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <button
              onClick={() => remove(i)}
              disabled={saving}
              className="text-gray-300 hover:text-red-600 hover:bg-red-50 rounded p-1.5 transition disabled:opacity-50"
              title={`Remove ${t.name}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Add new type */}
      <div className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg">
        <input
          type="text"
          value={draftIcon}
          onChange={(e) => setDraftIcon(e.target.value)}
          maxLength={4}
          placeholder="🏡"
          className="w-12 px-2 py-1 text-center text-base bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="New type name (e.g. NRAS, Granny Flat, DHA)"
          className="w-48 px-2 py-1 text-sm font-semibold bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
        />
        <input
          type="text"
          value={draftDesc}
          onChange={(e) => setDraftDesc(e.target.value)}
          placeholder="Description shown to the AI extractor (optional)"
          className="flex-1 px-2 py-1 text-xs text-gray-700 bg-white border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
          onKeyDown={(e) => { if (e.key === "Enter") addType(); }}
        />
        <button
          onClick={addType}
          disabled={saving || !draftName.trim()}
          className="px-3 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {saving ? "Saving…" : "+ Add"}
        </button>
      </div>

      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        These types appear in the <strong>Property type</strong> filter on the Aggregator Feed
        and are sent to the AI extractor so newly-ingested properties get classified accurately.
        Changes apply on the next aggregator cron run (every 15 minutes).
      </p>
    </div>
  );
}
