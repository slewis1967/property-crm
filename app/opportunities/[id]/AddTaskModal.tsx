"use client";

/**
 * Quick task creation from the opportunity detail page.
 *
 * POSTs to /api/tasks — same endpoint NewOpportunityModal uses for its
 * "+ Schedule task" inline section, so rows are identical regardless of
 * entry path (only the `source` tag differs: "opportunity_modal" from the
 * new-opp flow, "opportunity_detail" here).
 *
 * Failure is a soft error displayed in the modal — never partial state on
 * the parent, since the modal only closes via onCreated() on success.
 */

import { useState } from "react";
import { errMessage } from "../../../utils/errors";

type Lead = {
  lead_id: string;
  full_name: string | null;
};

export default function AddTaskModal({
  lead,
  contactId,
  onClose,
  onCreated,
}: {
  lead: Lead;
  /** Supabase contacts.id for this lead's primary contact. If null we
   * still write the task — it just won't be scoped to a contact, which
   * matches how voice's create_task tolerates a missing contact_id. */
  contactId: string | null;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const defaultTitle = lead.full_name ? `Follow up with ${lead.full_name}` : "";
  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState(""); // <input type="date"> value, optional
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Task title is required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          contact_id: contactId || undefined,
          due_date: dueDate || null,
          source: "opportunity_detail",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed (${res.status})`);
      }
      onCreated?.();
      onClose();
    } catch (e) {
      setError(errMessage(e, "Request failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">✅ Add task</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 text-lg leading-none">✕</button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Task</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={defaultTitle || "What needs to be done"}
              required
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Due date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
            />
            <p className="text-xs text-gray-400 mt-1">Leave blank for an open-ended task. Visible on /tasks and on the contact&apos;s detail page.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!contactId && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              ⚠ This lead has no matched CRM contact — the task will be created without a contact link.
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition disabled:opacity-60">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 text-sm font-semibold text-white bg-amber-600 rounded-xl hover:bg-amber-700 transition disabled:opacity-60">
              {submitting ? "Adding…" : "Add task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
