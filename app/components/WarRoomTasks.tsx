"use client";

/**
 * WarRoomTasks — the open live tasks (the "Add task" TODOs from opportunity
 * pages) surfaced on the War Room so nothing set on an opportunity gets lost.
 * Read from the `tasks` table; each can be ticked complete inline. Shows who
 * the task is for and when it's due, soonest first.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface WarRoomTask {
  id: string;
  title: string;
  due_date: string | null;
  contactName: string | null;
}

function fmtDue(iso: string | null): { label: string; overdue: boolean } {
  if (!iso) return { label: "", overdue: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "", overdue: false };
  return {
    label: d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
    overdue: d.getTime() < Date.now(),
  };
}

export default function WarRoomTasks({ tasks }: { tasks: WarRoomTask[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const complete = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Open Tasks</h2>
        <span className="text-xs text-gray-400">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing outstanding — tasks set on an opportunity show up here.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => {
            const due = fmtDue(t.due_date);
            return (
              <div key={t.id} className="flex items-start gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  checked={false}
                  disabled={busy === t.id}
                  onChange={() => complete(t.id)}
                  title="Mark complete"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{t.title}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {t.contactName || "Unassigned"}
                    {due.label && (
                      <span className={due.overdue ? "text-red-600 font-medium" : ""}>
                        {" · due "}{due.label}{due.overdue ? " (overdue)" : ""}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
