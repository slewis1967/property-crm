"use client";

import { useState, useTransition } from "react";

export default function GrossDeveloperFeeEditor({
  propertyId,
  initialValue,
}: {
  propertyId: string;
  initialValue: number | null;
}) {
  // Initialise from prop; subsequent prop changes are rare and can remount the component if needed
  const [value, setValue] = useState<string>(initialValue != null ? String(initialValue) : "");
  const [saving, startSaving] = useTransition();
  const [status, setStatus] = useState<"" | "saved" | "error">("");

  const onSave = () => {
    startSaving(async () => {
      setStatus("");
      try {
        const res = await fetch(`/api/properties/${encodeURIComponent(propertyId)}/financials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gross_developer_fee: value === "" ? null : Number(value) }),
        });
        if (!res.ok) throw new Error(`Save failed (${res.status})`);
        setStatus("saved");
        setTimeout(() => setStatus(""), 2000);
      } catch {
        setStatus("error");
      }
    });
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
        Financials (CRM only)
      </p>
      <div className="flex items-end gap-3">
        <label className="block text-sm font-medium text-gray-700">
          Gross developer fee (AUD)
          <input
            type="number"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 25000"
            className="mt-1 block w-48 rounded-md border-gray-300 shadow-sm focus:border-[#0F4C5C] focus:ring-[#0F4C5C] text-gray-900"
          />
        </label>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0F4C5C] hover:bg-[#0B3D4A] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span className="text-xs text-emerald-600">Saved</span>}
        {status === "error" && <span className="text-xs text-rose-600">Save failed</span>}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Used by PropChannel sync; not shown to clients.
      </p>
    </div>
  );
}

