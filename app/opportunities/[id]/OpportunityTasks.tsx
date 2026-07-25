"use client";

/**
 * Tasks panel on the opportunity detail page — the LIVE advisor TODOs created
 * via the "Add task" button (the `tasks` table), scoped to this opportunity's
 * contact. Distinct from the historical GHL-archive tasks shown elsewhere.
 * Each task can be ticked complete inline; the same tasks also surface in the
 * War Room so nothing set here gets lost.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface LiveTask {
  id: string;
  title: string;
  body: string | null;
  due_date: string | null;
  completed: boolean;
  created_at: string | null;
}

function fmtDue(iso: string | null): { label: string; overdue: boolean } {
  if (!iso) return { label: "", overdue: false };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { label: "", overdue: false };
  const label = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return { label, overdue: d.getTime() < Date.now() };
}

export default function OpportunityTasks({
  tasks,
  onAddTask,
}: {
  tasks: LiveTask[];
  onAddTask: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (t: LiveTask) => {
    setBusy(t.id);
    try {
      await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !t.completed }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  const open = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Tasks</h2>
        <button
          onClick={onAddTask}
          className="text-xs font-semibold text-blue-600 hover:underline"
        >
          + Add task
        </button>
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-gray-400">
          No tasks yet — use “Add task” to set a follow-up. It’ll show here and in the War Room.
        </p>
      ) : (
        <div className="space-y-2">
          {[...open, ...done].map((t) => {
            const due = fmtDue(t.due_date);
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={t.completed}
                  disabled={busy === t.id}
                  onChange={() => toggle(t)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 cursor-pointer disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${t.completed ? "text-gray-400 line-through" : "text-gray-800 font-medium"}`}>
                    {t.title}
                  </p>
                  {due.label && (
                    <p className={`text-xs ${!t.completed && due.overdue ? "text-red-600 font-medium" : "text-gray-400"}`}>
                      Due {due.label}
                      {!t.completed && due.overdue ? " · overdue" : ""}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
