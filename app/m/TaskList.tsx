"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dueLabel, dueState, sortTasks, type LiveTask } from "../../utils/tasks";

/**
 * Open tasks with a tap-to-complete circle. Ticks go through the same
 * PATCH /api/tasks/[id] the desktop Tasks page uses.
 *
 * Due labels are computed in the browser, after mount: the server runs in UTC,
 * so "today" there is yesterday in Brisbane until 10am.
 */
export default function TaskList({ tasks, limit }: { tasks: LiveTask[]; limit?: number }) {
  const [now, setNow] = useState<Date | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  // Deferred a tick, as AppShell does, to keep the set-state-in-effect lint rule happy.
  useEffect(() => { queueMicrotask(() => setNow(new Date())); }, []);

  const ordered = now ? sortTasks(tasks, now) : tasks;
  const open = ordered.filter((t) => !t.completed);
  const shown = limit ? open.slice(0, limit) : open;

  const toggle = async (t: LiveTask) => {
    const completed = !done.has(t.id);
    setError("");
    setDone((prev) => {
      const next = new Set(prev);
      if (completed) next.add(t.id);
      else next.delete(t.id);
      return next;
    });
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setError("Couldn't save that — check your connection and try again.");
      setDone((prev) => {
        const next = new Set(prev);
        if (completed) next.delete(t.id);
        else next.add(t.id);
        return next;
      });
    }
  };

  if (shown.length === 0) {
    return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500 shadow-sm">Nothing open. 🎉</p>;
  }

  return (
    <>
      {error && <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">
        {shown.map((t) => {
          const isDone = done.has(t.id);
          const state = now ? dueState(t.due_date, now) : "none";
          const label = now ? dueLabel(t.due_date, now) : "";
          return (
            <li key={t.id} className="flex items-start gap-3 px-4 py-3">
              <button
                type="button"
                onClick={() => toggle(t)}
                aria-label={isDone ? "Mark not done" : "Mark done"}
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm ${
                  isDone ? "border-green-600 bg-green-600 text-white" : "border-gray-300"
                }`}
              >
                {isDone ? "✓" : ""}
              </button>
              <div className="min-w-0 flex-1">
                <p className={`text-[15px] ${isDone ? "text-gray-400 line-through" : ""}`}>{t.title}</p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs">
                  {label && (
                    <span className={state === "overdue" ? "font-semibold text-red-600" : state === "today" ? "font-semibold text-amber-600" : "text-gray-500"}>
                      {label}
                    </span>
                  )}
                  {t.contactId && t.contactName && (
                    <Link href={`/m/contacts/${t.contactId}`} className="text-[#0F4C5C]">
                      {t.contactName}
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
