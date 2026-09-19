import { notFound } from "next/navigation";
import { supabase } from "../../../../utils/supabase";
import { formatAgendaDateTime, formatDateTime } from "../../../../utils/datetime";
import type { LiveTask } from "../../../../utils/tasks";
import { Header, Section, ContactButtons, Facts, List, money, LoadError } from "../../ui";
import TaskList from "../../TaskList";
import ContactNotes from "./ContactNotes";

export const dynamic = "force-dynamic";

type Contact = {
  id: string;
  name: string | null;
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  preferred_state: string | null;
  budget: number | string | null;
  budget_max: number | string | null;
  finance_status: string | null;
  timeframe: string | null;
  temperature: string | null;
  status: string | null;
  source: string | null;
  notes: string | null;
  created_at: string | null;
};

export default async function PhoneContact({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [contactRes, tasksRes, apptsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select(
        "id,name,full_name,first_name,email,phone,buyer_type,state,preferred_state,budget,budget_max," +
          "finance_status,timeframe,temperature,status,source,notes,created_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("id,title,body,due_date,completed,created_at,contact_id")
      .eq("contact_id", id)
      .eq("completed", false)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("appointments")
      .select("id,event_title,start_time,status")
      .eq("contact_id", id)
      .gte("start_time", new Date().toISOString())
      .neq("status", "cancelled")
      .order("start_time", { ascending: true })
      .limit(5),
  ]);

  if (contactRes.error) {
    return (
      <>
        <Header title="Contact" back="/m/contacts" />
        <div className="px-4 pt-4"><LoadError>Couldn&apos;t load this contact: {contactRes.error.message}</LoadError></div>
      </>
    );
  }
  const c = contactRes.data as Contact | null;
  if (!c) notFound();

  const name = c.full_name || c.name || c.first_name || c.email || "(no name)";
  const tasks: LiveTask[] = (tasksRes.data ?? []).map((t) => ({
    id: String(t.id),
    title: t.title || "(untitled task)",
    body: t.body ?? null,
    due_date: t.due_date ?? null,
    completed: false,
    created_at: t.created_at ?? null,
  }));
  const appts = apptsRes.data ?? [];

  return (
    <>
      <Header title={name} back="/m/contacts" fullHref={`/contacts/${c.id}`} />

      <div className="px-4 pt-4">
        <ContactButtons phone={c.phone} email={c.email} />
      </div>

      {appts.length > 0 && (
        <Section title="Upcoming">
          <List>
            {appts.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="text-xs font-semibold text-[#0F4C5C]">{formatAgendaDateTime(a.start_time)}</p>
                <p className="text-sm">{a.event_title || "Appointment"}</p>
              </li>
            ))}
          </List>
        </Section>
      )}

      {tasks.length > 0 && (
        <Section title="Open tasks">
          <TaskList tasks={tasks} />
        </Section>
      )}

      <ContactNotes contactId={c.id} notes={c.notes} />

      <Section title="Details">
        <Facts
          rows={[
            ["Phone", c.phone],
            ["Email", c.email],
            ["Status", c.status],
            ["Temperature", c.temperature],
            ["Buyer type", c.buyer_type],
            ["State", c.state || c.preferred_state],
            ["Budget", money(c.budget_max) ?? money(c.budget)],
            ["Finance", c.finance_status],
            ["Timeframe", c.timeframe],
            ["Source", c.source],
            ["Added", formatDateTime(c.created_at, "")],
          ]}
        />
      </Section>
    </>
  );
}
