"use client";

/**
 * The live task list. Tick things off, add one, see what's overdue.
 *
 * Deliberately not a second inbox: no bulk actions, no assignment, no
 * sub-tasks. The job it has to do is "what do I owe people today", which is
 * why the default filter is Open and the sort is most-overdue-first.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { dueLabel, dueState, sortTasks, taskCounts, type DueState, type LiveTask } from "../../utils/tasks";

const TEAL = "#0F4C5C";

type Filter = "open" | "overdue" | "completed" | "all";

const DUE_STYLE: Record<DueState, string> = {
  overdue: "bg-red-100 text-red-700",
  today: "bg-amber-100 text-amber-800",
  tomorrow: "bg-amber-50 text-amber-700",
  upcoming: "bg-gray-100 text-gray-600",
  none: "",
};

export default function TasksClient({
  tasks,
  loadError,
}: {
  tasks: LiveTask[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");

  // One clock for the whole render, so a task can't be "today" in the chip and
  // "overdue" in the sort.
  const now = useMemo(() => new Date(), []);
  const counts = useMemo(() => taskCounts(tasks, now), [tasks, now]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = tasks.filter((t) => {
      if (filter === "open" && t.completed) return false;
      if (filter === "completed" && !t.completed) return false;
      if (filter === "overdue" && (t.completed || dueState(t.due_date, now) !== "overdue")) return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.body ?? "").toLowerCase().includes(q) ||
        (t.contactName ?? "").toLowerCase().includes(q)
      );
    });
    return sortTasks(matches, now);
  }, [tasks, filter, query, now]);

  async function toggle(t: LiveTask) {
    setBusy(t.id);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: !t.completed }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not update the task.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the task.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: LiveTask) {
    // Confirmed because it is unrecoverable: unlike a contact or an
    // opportunity, a deleted task is not snapshotted to deletion_log.
    if (!confirm(`Delete “${t.title}”? This can’t be undone.`)) return;
    setBusy(t.id);
    setError("");
    try {
      const res = await fetch(`/api/tasks/${t.id}`, { method: "DELETE" });
      // A 404 means it is already gone — the refresh below IS the fix, so
      // don't shout at someone for deleting something twice.
      if (!res.ok && res.status !== 404) {
        throw new Error((await res.json().catch(() => ({}))).error || "Could not delete the task.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the task.");
    } finally {
      setBusy(null);
    }
  }

  async function addTask() {
    const title = newTitle.trim();
    if (!title) return;
    setBusy("new");
    setError("");
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, due_date: newDue || null, source: "tasks_page" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not create the task.");
      setNewTitle("");
      setNewDue("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the task.");
    } finally {
      setBusy(null);
    }
  }

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "open", label: "Open", count: counts.open },
    { key: "overdue", label: "Overdue", count: counts.overdue },
    { key: "completed", label: "Completed", count: counts.completed },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Tasks
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Everything created by the voice assistant, Quick Log, “Add task” and the opportunity
            pages. The retired GoHighLevel history is at{" "}
            <Link href="/tasks/archive" className="underline hover:text-gray-700">
              Tasks archive
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex-shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white"
          style={{ background: TEAL }}
        >
          {adding ? "Cancel" : "+ Add task"}
        </button>
      </div>

      {adding && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addTask();
              }}
              placeholder="What needs doing?"
              maxLength={200}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!newTitle.trim() || busy === "new"}
              onClick={() => void addTask()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: TEAL }}
            >
              {busy === "new" ? "Adding…" : "Add"}
            </button>
          </div>
        </div>
      )}

      {loadError && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Couldn’t load tasks: {loadError}
        </p>
      )}
      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === c.key
                ? "bg-gray-900 text-white"
                : c.key === "overdue" && c.count > 0
                  ? "bg-red-100 text-red-700 hover:bg-red-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {c.label} ({c.count})
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks or contacts…"
          className="ml-auto w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div className="mt-4 space-y-2">
        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            {tasks.length === 0
              ? "No tasks yet. Create one here, by voice, or from a contact’s Quick Log."
              : filter === "open"
                ? "Nothing outstanding — everything’s ticked off."
                : "No tasks match."}
          </p>
        ) : (
          visible.map((t) => {
            const state = dueState(t.due_date, now);
            const label = dueLabel(t.due_date, now);
            return (
              <div
                key={t.id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  t.completed ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"
                }`}
              >
                <button
                  type="button"
                  aria-label={t.completed ? "Mark as not done" : "Mark as done"}
                  disabled={busy === t.id}
                  onClick={() => void toggle(t)}
                  className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs ${
                    t.completed
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-gray-300 bg-white hover:border-gray-500"
                  } disabled:opacity-50`}
                >
                  {t.completed ? "✓" : ""}
                </button>

                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${t.completed ? "text-gray-400 line-through" : "text-gray-900"}`}>
                    {t.title}
                  </p>
                  {t.body && <p className="mt-0.5 text-xs text-gray-500">{t.body}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                    {t.contactId ? (
                      <Link href={`/contacts/${t.contactId}`} className="text-blue-600 hover:underline">
                        {t.contactName || "Contact"}
                      </Link>
                    ) : (
                      t.contactName && <span>{t.contactName}</span>
                    )}
                    {t.created_at && (
                      <span>
                        added{" "}
                        {new Date(t.created_at).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {label && !t.completed && (
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${DUE_STYLE[state]}`}
                  >
                    {label}
                  </span>
                )}

                <button
                  type="button"
                  aria-label={`Delete ${t.title}`}
                  title="Delete"
                  disabled={busy === t.id}
                  onClick={() => void remove(t)}
                  className="flex-shrink-0 rounded px-1.5 py-0.5 text-sm text-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
