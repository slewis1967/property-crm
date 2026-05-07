"use client";

import { useEffect, useMemo, useState } from "react";

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
  status: "pending" | "approved" | "rejected";
  ingestion_run?: {
    email_subject?: string | null;
    builder_name?: string | null;
    started_at?: string | null;
  } | null;
};

type StatusFilter = "pending" | "approved" | "rejected";
type SortMode = "confidence_desc" | "confidence_asc" | "newest" | "oldest";

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [sortMode, setSortMode] = useState<SortMode>("confidence_desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = async (status: StatusFilter = statusFilter) => {
    setItems(null);
    setError(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/aggregator/review-queue?status=${status}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Load failed");
      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };

  useEffect(() => {
    load(statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const sorted = useMemo(() => {
    if (!items) return [];
    const list = [...items];
    list.sort((a, b) => {
      switch (sortMode) {
        case "confidence_desc": return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
        case "confidence_asc":  return (a.confidence_score ?? 0) - (b.confidence_score ?? 0);
        case "newest":          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "oldest":          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
    });
    return list;
  }, [items, sortMode]);

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

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === sorted.length) setSelected(new Set());
    else setSelected(new Set(sorted.map((i) => i.id)));
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

  const bulkRun = async (action: "approve" | "reject") => {
    if (selected.size === 0) return;
    const word = action === "approve" ? "approve" : "reject";
    const confirm = window.confirm(
      `${word === "approve" ? "Approve" : "Reject"} ${selected.size} item(s)?` +
      (word === "approve" ? "\n\nThey'll publish to the Aggregator Feed with the AI's raw extraction (no per-item edits applied in bulk mode)." : ""),
    );
    if (!confirm) return;
    const reason = action === "reject"
      ? (prompt("Reason for bulk rejection (optional):") ?? "")
      : "";

    setBulkBusy(true);
    const ids = Array.from(selected);
    let ok = 0, fail = 0;
    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/aggregator/review-queue/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              action === "approve" ? { action: "approve" } : { action: "reject", reason },
            ),
          });
          const json = await res.json();
          if (!json.ok) throw new Error(json.error);
          ok++;
        } catch {
          fail++;
        }
      }),
    );
    setBulkBusy(false);
    if (fail > 0) alert(`${ok} ${word}d · ${fail} failed`);
    await load();
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;

  return (
    <div className="space-y-4">
      {/* Status tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200">
        {(["pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px capitalize ${
              statusFilter === s
                ? "border-amber-500 text-amber-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-gray-500">Sort:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="confidence_desc">Confidence (high → low)</option>
            <option value="confidence_asc">Confidence (low → high)</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
      </div>

      {items === null ? (
        <div className="text-gray-500 p-4 italic">Loading…</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-gray-500 font-medium mb-2">
            {statusFilter === "pending"
              ? "Nothing to review."
              : `No ${statusFilter} items.`}
          </p>
          {statusFilter === "pending" && (
            <p className="text-sm text-gray-400">
              New extractions with confidence below 0.5 will land here automatically.
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {statusFilter === "pending" && (
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2 sticky top-0 z-10">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === sorted.length}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < sorted.length;
                }}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-amber-500"
              />
              <span className="text-xs text-gray-600">
                {selected.size > 0 ? `${selected.size} selected` : `${sorted.length} item${sorted.length === 1 ? "" : "s"}`}
              </span>
              {selected.size > 0 && (
                <div className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => bulkRun("approve")}
                    disabled={bulkBusy}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {bulkBusy ? "Working…" : `Approve ${selected.size}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkRun("reject")}
                    disabled={bulkBusy}
                    className="px-3 py-1.5 bg-white text-red-700 text-xs font-semibold rounded border border-red-200 hover:bg-red-50 disabled:opacity-50"
                  >
                    Reject {selected.size}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    disabled={bulkBusy}
                    className="px-3 py-1.5 text-gray-500 text-xs font-semibold rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {sorted.map((item) => {
            const isOpen = expandedId === item.id;
            const isBusy = busy === item.id;
            const draft = edits[item.id] ?? item.raw_extraction;
            const conf = (item.confidence_score ?? 0) * 100;
            const isSelected = selected.has(item.id);
            const isPending = item.status === "pending";

            return (
              <div
                key={item.id}
                className={`bg-white border rounded-xl shadow-sm transition ${
                  isOpen ? "border-amber-300" : isSelected ? "border-amber-200 ring-1 ring-amber-200" : "border-gray-200"
                }`}
              >
                <div className="p-4 flex items-start gap-3">
                  {isPending && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1 h-4 w-4 accent-amber-500 flex-shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => (isOpen ? setExpandedId(null) : startEditing(item))}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: conf < 30 ? "#fee2e2" : conf < 60 ? "#fef3c7" : "#dcfce7",
                          color: conf < 30 ? "#991b1b" : conf < 60 ? "#92400e" : "#166534",
                        }}
                      >
                        {conf.toFixed(0)}% confidence
                      </span>
                      {item.status !== "pending" && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            item.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.status}
                        </span>
                      )}
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
                  </button>
                  <span className="text-gray-400 text-xs mt-1">
                    {isOpen ? "▼" : "▶"}
                  </span>
                </div>

                {isOpen && (
                  <div className="border-t border-gray-100 p-4 bg-amber-50/40">
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {FIELDS.map((f) => {
                        const blank = draft[f.key] === null || draft[f.key] === undefined || draft[f.key] === "";
                        return (
                          <label key={f.key} className="block text-xs">
                            <span className="font-medium text-gray-600 mb-0.5 block flex items-center gap-1">
                              {f.label}
                              {blank && <span className="text-amber-600 text-[10px]">(empty)</span>}
                            </span>
                            <input
                              type={f.type === "number" ? "number" : "text"}
                              value={draft[f.key] ?? ""}
                              disabled={!isPending}
                              onChange={(e) =>
                                updateField(
                                  item.id,
                                  f.key,
                                  f.type === "number" && e.target.value
                                    ? Number(e.target.value)
                                    : e.target.value,
                                )
                              }
                              className={`w-full px-2 py-1 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                                blank ? "border-amber-300 bg-amber-50" : "border-gray-200"
                              } disabled:bg-gray-50 disabled:text-gray-500`}
                            />
                          </label>
                        );
                      })}
                    </div>

                    <details className="text-xs text-gray-500 mb-3">
                      <summary className="cursor-pointer hover:text-gray-700">
                        Raw AI extraction (read-only)
                      </summary>
                      <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs mt-2 overflow-x-auto">
                        {JSON.stringify(item.raw_extraction, null, 2)}
                      </pre>
                    </details>

                    {isPending && (
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
                    )}
                    {!isPending && item.status === "approved" && (
                      <p className="text-xs text-emerald-700">
                        Published to the Aggregator Feed. View in /properties.
                      </p>
                    )}
                    {!isPending && item.status === "rejected" && (
                      <p className="text-xs text-red-700">
                        Rejected — not published.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
