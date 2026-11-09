import { supabase } from "../../../utils/supabase";
import { Header, LoadError } from "../ui";
import TaskList from "../TaskList";
import { OPEN_TASKS_SELECT, toLiveTasks, type RawTask } from "../data";

export const dynamic = "force-dynamic";

/** Every open task, most overdue first. Completed tasks and editing stay on the full Tasks page. */
export default async function PhoneTasks() {
  const { data, error } = await supabase
    .from("tasks")
    .select(OPEN_TASKS_SELECT)
    .eq("completed", false)
    .order("created_at", { ascending: false })
    .limit(500);
  const tasks = toLiveTasks((data ?? []) as RawTask[]);

  return (
    <>
      <Header title={`Tasks${tasks.length ? ` · ${tasks.length}` : ""}`} back="/m" fullHref="/tasks" />
      <div className="px-4 pt-4">
        {error ? <LoadError>Couldn&apos;t load tasks: {error.message}</LoadError> : <TaskList tasks={tasks} />}
      </div>
    </>
  );
}
