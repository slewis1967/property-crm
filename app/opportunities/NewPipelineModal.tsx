"use client";

import { useState } from "react";

const COLORS = [
  { hex: "#3b82f6", cls: "bg-blue-500" },
  { hex: "#8b5cf6", cls: "bg-violet-500" },
  { hex: "#10b981", cls: "bg-emerald-500" },
  { hex: "#f59e0b", cls: "bg-amber-500" },
  { hex: "#ef4444", cls: "bg-red-500" },
  { hex: "#ec4899", cls: "bg-pink-500" },
  { hex: "#06b6d4", cls: "bg-cyan-500" },
  { hex: "#f97316", cls: "bg-orange-500" },
];

type Props = {
  onClose: () => void;
  onCreated: (pipeline: { id: string; name: string; stages: string[]; color: string }) => void;
};

export default function NewPipelineModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  // New pipelines start empty; the user adds stages from the Kanban board's
  // "+ Add stage" placeholder column. Stages can also be seeded here if they
  // want the whole structure up-front, but the default is no stages.
  const [stages, setStages] = useState<string[]>([]);
  const [newStage, setNewStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addStage = () => {
    const s = newStage.trim();
    if (!s || stages.includes(s)) return;
    setStages([...stages, s]);
    setNewStage("");
  };

  const removeStage = (i: number) => setStages(stages.filter((_, idx) => idx !== i));

  const moveStage = (i: number, dir: -1 | 1) => {
    const arr = [...stages];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setStages(arr);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("Pipeline name is required"); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch("/api/pipelines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), stages, color }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      onCreated(data);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Pipeline</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pipeline Name *</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Investor Pipeline"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Colour</label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.hex} type="button" onClick={() => setColor(c.hex)}
                  className={`w-7 h-7 rounded-full ${c.cls} transition ${color === c.hex ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : "opacity-70 hover:opacity-100"}`}
                />
              ))}
            </div>
          </div>

          {/* Stages — optional; pipelines can be created blank and stages added from the board */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Stages <span className="text-gray-400 normal-case font-normal">(optional)</span></label>
              {stages.length === 0 && (
                <span className="text-[11px] text-gray-400">leave empty to add from the board</span>
              )}
            </div>
            <div className="space-y-1.5 mb-3">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm text-gray-700">{s}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs px-1">↑</button>
                    <button type="button" onClick={() => moveStage(i, 1)} disabled={i === stages.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30 text-xs px-1">↓</button>
                    <button type="button" onClick={() => removeStage(i)}
                      className="text-gray-300 hover:text-red-500 text-xs px-1 ml-1">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newStage} onChange={(e) => setNewStage(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStage(); }}}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Add a stage…"
              />
              <button type="button" onClick={addStage}
                className="px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition">
                Add
              </button>
            </div>
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition">
            {saving ? "Creating…" : "Create Pipeline"}
          </button>
        </div>
      </div>
    </div>
  );
}
