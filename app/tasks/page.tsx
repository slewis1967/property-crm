import { supabase } from "../../utils/supabase";
import type { LiveTask } from "../../utils/tasks";
import TasksClient from "./TasksClient";

/**
 * The LIVE task list — the `tasks` table: what the voice assistant, Quick Log,
 * "Add task" and the opportunity page all write to.
 *
 * Until now those tasks had nowhere to be seen as a list. They surfaced twelve
 * at a time on the War Room and per-contact on the opportunity page, and /tasks
 * showed the frozen GoHighLevel archive instead — so a task created by voice
 * could only be found by knowing which contact it was against. That archive now
 * lives at /tasks/archive.
 *
 * Server-rendered like the War Room rather than fetched client-side: there is no
 * GET on /api/tasks, the whole table is small (tens of rows), and it means the
 * list is correct on first paint. Mutations go through the existing
 * PATCH /api/tasks/[id] and POST /api/tasks, then router.refresh().
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tasks — NextKey",
};

type RawTask = {
  id: string;
  title: string | null;
  body: string | null;
  due_date: string | null;
  completed: boolean | null;
  created_at: string | null;
  contact_id: string | null;
  contact?: { name: string | null } | { name: string | null }[] | null;
};

/**
 * Every task, with the contact it belongs to. Completed ones are included so
 * the page can show what was done — the client filters, and the table is small
 * enough that paging it would be ceremony.
 */
async function fetchTasks(): Promise<{ tasks: LiveTask[]; error: string | null }> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,title,body,due_date,completed,created_at,contact_id,contact:contacts(name)")
    .order("created_at", { ascending: false })
    .limit(500);

  // A missing table or a failed read must not render as "no tasks" — that reads
  // as an empty to-do list and is exactly how work goes quietly missing.
  if (error) return { tasks: [], error: error.message };

  const tasks = ((data ?? []) as RawTask[]).map((t) => {
    const c = Array.isArray(t.contact) ? t.contact[0] : t.contact;
    return {
      id: String(t.id),
      title: t.title || "(untitled task)",
      body: t.body ?? null,
      due_date: t.due_date ?? null,
      completed: t.completed === true,
      created_at: t.created_at ?? null,
      contactId: t.contact_id ?? null,
      contactName: c?.name ?? null,
    };
  });
  return { tasks, error: null };
}

export default async function TasksPage() {
  const { tasks, error } = await fetchTasks();
  return <TasksClient tasks={tasks} loadError={error} />;
}
