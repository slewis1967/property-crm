/**
 * Due-date reasoning for the LIVE tasks list (`/tasks`, the `tasks` table).
 *
 * Pure and separately tested because "is this overdue?" is where date code goes
 * wrong quietly: the table stores BOTH shapes — a date-only `2026-05-08` from
 * the create form, and a full `2026-05-08T01:45:30.048+00:00` from Quick Log and
 * the voice assistant. `new Date("2026-05-08")` parses as UTC midnight, which in
 * AEST is 10am on the 8th — so a task due today reads as overdue for the first
 * ten hours of every day. Date-only values are therefore parsed as LOCAL
 * midnight and compared by calendar day, never by raw timestamp.
 */

export type LiveTask = {
  id: string;
  title: string;
  body: string | null;
  due_date: string | null;
  completed: boolean;
  created_at: string | null;
  contactName?: string | null;
  contactId?: string | null;
};

export type DueState = "none" | "overdue" | "today" | "tomorrow" | "upcoming";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The moment a due value falls on, in the reader's own timezone. Date-only
 * strings become local midnight; timestamps are taken as they are.
 */
export function parseDue(due: string | null | undefined): Date | null {
  if (!due) return null;
  if (DATE_ONLY.test(due)) {
    const [y, m, d] = due.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  }
  const parsed = new Date(due);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole calendar days from `now` to `due` — negative when it has passed. */
export function daysUntilDue(due: string | null | undefined, now: Date): number | null {
  const d = parseDue(due);
  if (!d) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
}

export function dueState(due: string | null | undefined, now: Date): DueState {
  const days = daysUntilDue(due, now);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return "upcoming";
}

/** Short human label for the due chip: "3 days overdue", "Today", "12 Aug". */
export function dueLabel(due: string | null | undefined, now: Date): string {
  const days = daysUntilDue(due, now);
  const d = parseDue(due);
  if (days === null || !d) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "1 day overdue";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days <= 7) return `In ${days} days`;
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Working order: what needs doing, soonest first.
 *
 * Open before completed; within open, the most overdue first and undated last
 * (an undated task isn't urgent, but it mustn't disappear below completed
 * ones); completed most recently created first.
 */
export function sortTasks(tasks: LiveTask[], now: Date): LiveTask[] {
  const rank = (t: LiveTask) => {
    if (t.completed) return 2;
    return t.due_date ? 0 : 1;
  };
  return [...tasks].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const da = daysUntilDue(a.due_date, now)!;
      const db = daysUntilDue(b.due_date, now)!;
      if (da !== db) return da - db;
    }
    const ca = a.created_at ? Date.parse(a.created_at) : 0;
    const cb = b.created_at ? Date.parse(b.created_at) : 0;
    return cb - ca;
  });
}

/** Counts for the filter chips. */
export function taskCounts(tasks: LiveTask[], now: Date) {
  let open = 0;
  let overdue = 0;
  let completed = 0;
  for (const t of tasks) {
    if (t.completed) {
      completed++;
      continue;
    }
    open++;
    if (dueState(t.due_date, now) === "overdue") overdue++;
  }
  return { open, overdue, completed, all: tasks.length };
}
