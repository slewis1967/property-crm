"use client";

import { useState } from "react";

/**
 * Toolbar actions for a generated report. "Update" jumps back to the packet hub
 * (edit assumptions / changes, then regenerate). "Delete" removes this report.
 * Not printed (lives in the no-print toolbar).
 */
export default function ReportActions({ reportId, dealPacketId }: { reportId: string; dealPacketId: string | null }) {
  const [busy, setBusy] = useState(false);
  const hubHref = dealPacketId ? `/deal-analyser/${dealPacketId}` : "/deal-analyser";

  async function del() {
    if (!confirm("Delete this report? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pia/reports/${reportId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      window.location.href = hubHref;
    } catch (e: any) {
      alert(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <a href={hubHref} className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50">
        Update
      </a>
      <button
        onClick={del}
        disabled={busy}
        className="px-3 py-2 text-sm font-semibold border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
