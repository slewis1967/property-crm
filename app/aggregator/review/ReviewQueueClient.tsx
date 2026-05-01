"use client";

import { useEffect, useState } from "react";

type QueueItem = {
  id: string;
  raw_extraction: Record<string, any>;
  builder_name: string | null;
  estate_name: string | null;
  lot_number: string | null;
  confidence_score: number;
  reasons: string[];
  created_at: string;
  ingestion_run_id: string | null;
  ingestion_run?: {
    email_subject?: string | null;
    builder_name?: string | null;
    started_at?: string | null;
  } | null;
};

const FIELDS: Array<{ key: string; label: string; type?: "number" | "text" }> = [
  { key: "builder_name", label: "Builder" },
  { key: "estate_name", label: "Estate" },
  { key: "lot_number", label: "Lot #" },
  { key: "street_address", label: "Street address" },
  { key: "suburb", label: "Suburb" },
  { key: "state", label: "State" },
  { key: "bedrooms", label: "Bedrooms", type: "number" },
  { key: "bathrooms", label: "Bathrooms", type: "number" },
  { key: "car_spaces", label: "Car spaces", type: "number" },
  { key: "land_size_sqm", label: "Land size (sqm)", type: "number" },
  { key: "house_size", label: "House size", type: "number" },
  { key: "house_price", label: "House price", type: "number" },
  { key: "land_price", label: "Land price", type: "number" },
  { key: "total_package_price", label: "Total package", type: "number" },
  { key: "expected_rent_weekly", label: "Rent (weekly)", type: "number" },
  { key: "sda_category", label: "SDA category" },
  { key: "rebates", label: "Rebates" },
  { key: "status", label: "Status" },
];

export default function ReviewQueueClient() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, Record<string, any>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setItems(null);
    setError(null);
    try {
      const res = await fetch("/api/aggregator/review-queue");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Load failed");
      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const startEditing = (item: QueueItem) => {
    setExpandedId(item.id);
    if (!edits[item.id]) {
      setEdits((prev) => ({ ...prev, [item.id]: { ...item.raw_extraction } }));
    }
  };

  const updateField = (id: string, key: string, value: any) => {
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: value === "" ? null : value },
    }));
  };

  const approve = async (item: QueueItem) => {
    setBusy(item.id);
    try {
      const res = await fetch(`/api/aggregator/review-queue/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          edited_extraction: edits[item.id] ?? item.raw_extraction,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
    } catch (e: any) {
      alert(`Approve failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const reject = async (item: QueueItem) => {
    const reason = prompt("Reason for rejection (optional):") ?? "";
    setBusy(item.id);
    try {
      const res = await fetch(`/api/aggregator/review-queue/${item.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
    } catch (e: any) {
      alert(`Reject failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;
  if (items === null) {
    return <div className="text-gray-500 p-4 italic">Loading…</div>;
  }
  if (items.length === 0) {
    return (
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
        <p className="text-gray-500 font-medium mb-2">Nothing to review.</p>
        <p className="text-sm text-gray-400">
          New extractions with confidence below 0.5 will land here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const isOpen = expandedId === item.id;
        const isBusy = busy === item.id;
        const draft = edits[item.id] ?? item.raw_extraction;
        const conf = (item.confidence_score ?? 0) * 100;

        return (
          <div
            key={item.id}
            className={`bg-white border rounded-xl shadow-sm transition ${
              isOpen ? "border-amber-300" : "border-gray-200"
            }`}
          >
            <button
              type="button"
              onClick={() => (isOpen ? setExpandedId(null) : startEditing(item))}
              className="w-full text-left p-4 flex items-center gap-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: conf < 30 ? "#fee2e2" : "#fef3c7",
                      color: conf < 30 ? "#991b1b" : "#92400e",
                    }}
                  >
                    {conf.toFixed(0)}% confidence
                  </span>
                  <span className="text-sm font-semibold text-gray-800">
                    {item.builder_name ?? "(no builder)"} · Lot {item.lot_number ?? "?"} ·{" "}
                    {item.estate_name ?? "(no estate)"}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {(item.reasons ?? []).join(" · ") || "no specific reasons"}
                </p>
                {item.ingestion_run?.email_subject && (
                  <p className="text-xs text-gray-400 mt-1">
                    From email: <em>{item.ingestion_run.email_subject}</em>
                  </p>
                )}
              </div>
              <span className="text-gray-400 text-xs">
                {isOpen ? "▼" : "▶"}
              </span>
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 p-4 bg-amber-50/40">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {FIELDS.map((f) => (
                    <label key={f.key} className="block text-xs">
                      <span className="font-medium text-gray-600 mb-0.5 block">
                        {f.label}
                      </span>
                      <input
                        type={f.type === "number" ? "number" : "text"}
                        value={draft[f.key] ?? ""}
                        onChange={(e) =>
                          updateField(
                            item.id,
                            f.key,
                            f.type === "number" && e.target.value
                              ? Number(e.target.value)
                              : e.target.value,
                          )
                        }
                        className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </label>
                  ))}
                </div>

                <details className="text-xs text-gray-500 mb-3">
                  <summary className="cursor-pointer hover:text-gray-700">
                    Raw AI extraction (read-only)
                  </summary>
                  <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs mt-2 overflow-x-auto">
                    {JSON.stringify(item.raw_extraction, null, 2)}
                  </pre>
                </details>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => approve(item)}
                    disabled={isBusy}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBusy ? "Working…" : "Approve & publish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(item)}
                    disabled={isBusy}
                    className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reject
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
