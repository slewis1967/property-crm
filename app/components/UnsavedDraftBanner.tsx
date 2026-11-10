"use client";

/**
 * Shown at the top of a compliance form when useLocalDraft finds a leftover
 * local backup — edits from a previous session that never made it to the server
 * (e.g. a save failed and the tab was reloaded). Lets the user restore or discard.
 */

const TEAL = "#0F4C5C";

export default function UnsavedDraftBanner({
  ts,
  onRestore,
  onDiscard,
}: {
  /** When the backup was last written (ms epoch); 0 if unknown. */
  ts: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when =
    ts > 0
      ? new Date(ts).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : "an earlier session";

  return (
    <div className="no-print mx-4 mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start justify-between gap-3">
      <div className="text-sm text-amber-900">
        <strong>Unsaved changes recovered.</strong> This form has edits from {when} that were never
        saved to the server — a save may have failed. Restore them?
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onRestore}
          className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg transition"
          style={{ backgroundColor: TEAL }}
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-100 transition"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
