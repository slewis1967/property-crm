import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { formatAgendaDateTime } from "../../utils/datetime";
import { Header, Section, List, Empty, LoadError } from "./ui";
import TaskList from "./TaskList";
import { loadLeads, loadPipelines, stageOf, tempDot, OPEN_TASKS_SELECT, toLiveTasks, type RawTask } from "./data";

export const dynamic = "force-dynamic";

type Appt = {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string;
  event_title: string | null;
  start_time: string;
  location: string | null;
  status: string;
};

const NEW_LEADS = 8;

/** Today: open tasks, the next week of appointments, and the newest leads. */
export default async function PhoneToday() {
  const now = new Date();
  const weekOut = new Date(now.getTime() + 7 * 86400_000).toISOString();

  const [tasksRes, apptsRes, leadsRes, pipelines] = await Promise.all([
    supabase
      .from("tasks")
      .select(OPEN_TASKS_SELECT)
      .eq("completed", false)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("appointments")
      .select("id,contact_id,contact_name,contact_email,event_title,start_time,location,status")
      .gte("start_time", now.toISOString())
      .lte("start_time", weekOut)
      .neq("status", "cancelled")
      .order("start_time", { ascending: true })
      .limit(20),
    loadLeads(),
    loadPipelines(),
  ]);

  const tasks = toLiveTasks((tasksRes.data ?? []) as RawTask[]);
  const appts = (apptsRes.data ?? []) as Appt[];
  const newest = [...leadsRes.leads]
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""))
    .slice(0, NEW_LEADS);

  return (
    <>
      <Header title="Today" fullHref="/" />

      <Section
        title={`Tasks${tasks.length ? ` · ${tasks.length} open` : ""}`}
        action={<Link href="/m/tasks" className="text-xs text-[#0F4C5C]">All tasks</Link>}
      >
        {tasksRes.error ? <LoadError>Couldn&apos;t load tasks: {tasksRes.error.message}</LoadError> : <TaskList tasks={tasks} limit={5} />}
      </Section>

      <Section
        title="Next 7 days"
        action={<Link href="/appointments" className="text-xs text-[#0F4C5C]">Calendar</Link>}
      >
        {apptsRes.error ? (
          <LoadError>Couldn&apos;t load appointments: {apptsRes.error.message}</LoadError>
        ) : appts.length === 0 ? (
          <Empty>No appointments booked this week.</Empty>
        ) : (
          <List>
            {appts.map((a) => {
              const who = a.contact_name || a.contact_email;
              const body = (
                <>
                  <p className="text-xs font-semibold text-[#0F4C5C]">{formatAgendaDateTime(a.start_time)}</p>
                  <p className="text-[15px] font-medium">{who}</p>
                  <p className="truncate text-xs text-gray-500">{[a.event_title, a.location].filter(Boolean).join(" · ")}</p>
                </>
              );
              return (
                <li key={a.id}>
                  {a.contact_id ? (
                    <Link href={`/m/contacts/${a.contact_id}`} className="block px-4 py-3 active:bg-gray-50">{body}</Link>
                  ) : (
                    <div className="px-4 py-3">{body}</div>
                  )}
                </li>
              );
            })}
          </List>
        )}
      </Section>

      <Section
        title="Newest leads"
        action={<Link href="/m/leads" className="text-xs text-[#0F4C5C]">All leads</Link>}
      >
        {leadsRes.error ? (
          <LoadError>Couldn&apos;t load leads: {leadsRes.error}</LoadError>
        ) : newest.length === 0 ? (
          <Empty>No leads yet.</Empty>
        ) : (
          <List>
            {newest.map((l) => (
              <li key={l.lead_id}>
                <Link href={`/m/leads/${l.lead_id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tempDot[l.temperature ?? ""] ?? "bg-gray-300"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium">{l.full_name || l.email || "(no name)"}</p>
                    <p className="truncate text-xs text-gray-500">{stageOf(l, pipelines)}{l.state ? ` · ${l.state}` : ""}</p>
                  </div>
                  <span className="text-gray-300">›</span>
                </Link>
              </li>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
