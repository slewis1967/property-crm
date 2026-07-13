"use client";

import { useEffect, useState } from "react";

/**
 * Reusable "reason + your name required" gate for deleting a CLIENT (contact)
 * or an OPPORTUNITY.
 *
 * Business rule (user's words): "When deleting a client/opportunity from the
 * CRM the user will need to add their reason for doing so and their name."
 *
 * The confirm button stays disabled until BOTH fields are non-empty. The same
 * requirement is enforced server-side (the delete API rejects 400 without a
 * reason + name), so this modal is the friendly front door, not the only gate.
 */
export default function DeleteReasonModal({
  open,
  entityLabel,
  entityType,
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** What's being deleted, e.g. a contact name or "3 contacts". */
  entityLabel: string;
  entityType: "contact" | "opportunity";
  /** Disables the form while the delete request is in flight. */
  busy?: boolean;
  /** Server-side error to surface (e.g. a 400 or a failed delete). */
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string, name: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [name, setName] = useState("");

  // Reset the fields whenever the modal (re)opens so a previous entry never
  // carries over to the next deletion. Deferred out of the effect body (via
  // queueMicrotask) so we're not calling setState synchronously on the render
  // that opened the modal — matches the app's convention and avoids the
  // cascading-render lint.
  useEffect(() => {
    if (open) {
      queueMicrotask(() => {
        setReason("");
        setName("");
      });
    }
  }, [open]);

  if (!open) return null;

  const noun = entityType === "contact" ? "client" : "opportunity";
  const canDelete = reason.trim().length > 0 && name.trim().length > 0 && !busy;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <div className="text-3xl mb-3 text-center">🗑️</div>
        <h3 className="text-base font-bold text-gray-900 text-center mb-1">
          Delete {entityLabel}?
        </h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          This permanently deletes the {noun} and cannot be undone. Please record
          why you&apos;re deleting it and your name for the audit log.
        </p>

        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Reason for deletion <span className="text-red-600">*</span>
        </label>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          placeholder="e.g. Duplicate record / created in error / client requested removal…"
          className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-[#0F4C5C] focus:border-transparent disabled:opacity-60"
        />

        <label className="block text-xs font-semibold text-gray-600 mb-1 mt-4">
          Your name <span className="text-red-600">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          placeholder="Who is deleting this?"
          className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C] focus:border-transparent disabled:opacity-60"
        />

        {error && (
          <p className="text-xs text-red-600 mt-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim(), name.trim())}
            disabled={!canDelete}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
