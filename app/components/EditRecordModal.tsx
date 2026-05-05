"use client";

/**
 * Generic edit modal for opportunity (lead) and contact records.
 * Caller passes the current record + the PATCH endpoint URL; we render
 * a form with the fields most users actually want to update, save the
 * delta back via PATCH, and call onSaved with the merged result so the
 * parent can update its local state without a refetch.
 */
import { useState } from "react";

type FieldDef =
  | { key: string; label: string; type: "text" | "email" | "tel" | "number" }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "textarea" };

export type RecordKind = "opportunity" | "contact";

const OPP_FIELDS: FieldDef[] = [
  { key: "full_name",   label: "Full name",   type: "text" },
  { key: "email",       label: "Email",       type: "email" },
  { key: "phone",       label: "Phone",       type: "tel" },
  { key: "buyer_type",  label: "Buyer type",  type: "select",
    options: ["", "Owner Occupier", "Investor", "First Home Buyer", "SDA", "SMSF", "Downsizer"] },
  { key: "state",       label: "State",       type: "select",
    options: ["", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] },
  { key: "budget",      label: "Budget",      type: "text" },
  { key: "timeframe",   label: "Timeframe",   type: "text" },
  { key: "temperature", label: "Temperature", type: "select",
    options: ["", "hot", "warm", "cold"] },
  { key: "score",       label: "Score",       type: "number" },
  { key: "source",      label: "Source",      type: "text" },
  { key: "segment",     label: "Segment",     type: "text" },
  { key: "message",     label: "Message",     type: "textarea" },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: "full_name",       label: "Full name",        type: "text" },
  { key: "name",            label: "Display name",     type: "text" },
  { key: "email",           label: "Email",            type: "email" },
  { key: "phone",           label: "Phone",            type: "tel" },
  { key: "buyer_type",      label: "Buyer type",       type: "select",
    options: ["", "Owner Occupier", "Investor", "First Home Buyer", "SDA", "SMSF", "Downsizer"] },
  { key: "preferred_state", label: "Preferred state",  type: "select",
    options: ["", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"] },
  { key: "budget_max",      label: "Budget (max)",     type: "number" },
  { key: "timeframe",       label: "Timeframe",        type: "text" },
  { key: "temperature",     label: "Temperature",      type: "select",
    options: ["", "hot", "warm", "cold"] },
  { key: "lead_score",      label: "Lead score",       type: "number" },
  { key: "segment",         label: "Segment",          type: "text" },
  { key: "source",          label: "Source",           type: "text" },
  { key: "message",         label: "Message",          type: "textarea" },
];

export default function EditRecordModal({
  kind,
  record,
  patchUrl,
  onClose,
  onSaved,
}: {
  kind: RecordKind;
  record: Record<string, any>;
  patchUrl: string;
  onClose: () => void;
  onSaved: (updated: Record<string, any>) => void;
}) {
  const fields = kind === "opportunity" ? OPP_FIELDS : CONTACT_FIELDS;

  // Local form state — start from current record values
  const initial: Record<string, any> = {};
  for (const f of fields) {
    initial[f.key] = record[f.key] ?? (f.type === "number" ? 0 : "");
  }
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Only send fields that actually changed; skip empty strings if the
    // record was previously null so we don't write "" over null
    const delta: Record<string, any> = {};
    for (const f of fields) {
      const current = record[f.key];
      const next = form[f.key];
      const blank = next === "" || next === null || next === undefined;
      if (blank && (current === null || current === undefined || current === "")) continue;
      if (next !== current) delta[f.key] = blank ? null : next;
    }

    if (Object.keys(delta).length === 0) {
      onClose();
      return;
    }

    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      onSaved({ ...record, ...delta });
      onClose();
    } catch (e: any) {
      setError(e.message || "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Edit {kind === "opportunity" ? "opportunity" : "contact"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                {f.label}
              </label>
              {f.type === "textarea" ? (
                <textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : f.type === "select" ? (
                <select
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {f.options.map((o) => (
                    <option key={o} value={o}>{o || "—"}</option>
                  ))}
                </select>
              ) : f.type === "number" ? (
                <input
                  type="number"
                  value={form[f.key] ?? 0}
                  onChange={(e) => set(f.key, Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <input
                  type={f.type}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>
          ))}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
