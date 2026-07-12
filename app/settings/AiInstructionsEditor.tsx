"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * Settings editor for the voice assistant's custom instructions. Free text the
 * operator can add to steer tone / phrasing / defaults. Saved via
 * PUT /api/settings/ai-instructions; picked up on the assistant's next reply.
 */
const MAX = 4000;

const PLACEHOLDER = `e.g.
- Refer to our co-living homes as "NDIS-ready" only where the flyer confirms it.
- When booking callbacks, default to weekday mornings.
- Keep a warm, plain-English tone; never use jargon like "yield compression".`;

export default function AiInstructionsEditor({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const dirty = value !== initial;

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/ai-instructions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions: value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Save failed");
      setStatus({ kind: "ok", msg: value.trim() ? "Saved" : "Cleared" });
    } catch (e) {
      setStatus({ kind: "err", msg: errMessage(e, "Save failed") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value.slice(0, MAX));
          setStatus(null);
        }}
        rows={8}
        placeholder={PLACEHOLDER}
        className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-gray-400">
          {value.length}/{MAX}
        </span>
        <div className="flex items-center gap-3">
          {status && (
            <span className={`text-xs ${status.kind === "ok" ? "text-green-600" : "text-red-600"}`}>
              {status.msg}
            </span>
          )}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
            style={{ background: "#0F4C5C" }}
          >
            {saving ? "Saving…" : "Save instructions"}
          </button>
        </div>
      </div>
    </div>
  );
}
