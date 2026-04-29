import Link from "next/link";
import { supabase } from "../../../../utils/supabase";
import {
  fmtDate,
  fmtDateTime,
  fmtCurrency,
  truncate,
  stripHtml,
  splitGhlNoteBundle,
} from "../../_lib";

export const dynamic = "force-dynamic";

const statusColor = (s: string | null) => {
  if (!s) return "bg-gray-100 text-gray-600";
  const k = s.toLowerCase();
  if (k === "won") return "bg-green-100 text-green-700";
  if (k === "lost") return "bg-red-100 text-red-700";
  if (k === "open") return "bg-blue-100 text-blue-700";
  if (k === "abandoned") return "bg-gray-100 text-gray-600";
  return "bg-purple-100 text-purple-700";
};

const typeColor = (t: string | null) => {
  if (!t) return "bg-gray-100 text-gray-600";
  if (t.toLowerCase().includes("sms")) return "bg-green-100 text-green-700";
  if (t.toLowerCase().includes("email")) return "bg-blue-100 text-blue-700";
  if (t.toLowerCase().includes("call")) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
};

export default async function ArchiveContactDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Pull the contact and every related record in parallel
  const [
    { data: contact, error: contactErr },
    { data: notes },
    { data: tasks },
    { data: conversations },
    { data: opportunities },
    { data: appointments },
  ] = await Promise.all([
    supabase.from("ghl_archive_contacts").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ghl_archive_notes")
      .select("id,body,user_id,pinned,date_added")
      .eq("contact_id", id)
      .order("date_added", { ascending: false, nullsFirst: false }),
    supabase
      .from("ghl_archive_tasks")
      .select("id,title,body,due_date,completed,date_added")
      .eq("contact_id", id)
      .order("date_added", { ascending: false, nullsFirst: false }),
    supabase
      .from("ghl_archive_conversations")
      .select("id,type,unread_count,last_message_body,last_message_type,last_message_date")
      .eq("contact_id", id)
      .order("last_message_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("ghl_archive_opportunities")
      .select("id,name,pipeline_id,pipeline_stage_id,status,monetary_value,date_added")
      .eq("contact_id", id)
      .order("date_added", { ascending: false, nullsFirst: false }),
    supabase
      .from("ghl_archive_appointments")
      .select("id,title,appointment_status,start_time,calendar_id")
      .eq("contact_id", id)
      .order("start_time", { ascending: false, nullsFirst: false }),
  ]);

  if (contactErr || !contact) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Contact not found</h1>
        <p className="text-gray-500">No contact in the archive with id <code>{id}</code>.</p>
        <Link href="/archive/contacts" className="text-blue-600 hover:underline mt-3 inline-block">← Back to contacts</Link>
      </div>
    );
  }

  const name = contact.contact_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "(unnamed)";
  const tags = Array.isArray(contact.tags) ? contact.tags : [];

  // Pipeline + stage labels for this contact's opportunities
  const pipelineIds = Array.from(new Set((opportunities ?? []).map((o: any) => o.pipeline_id).filter(Boolean)));
  const stageIds = Array.from(new Set((opportunities ?? []).map((o: any) => o.pipeline_stage_id).filter(Boolean)));
  const [{ data: pipelines }, { data: stages }] = await Promise.all([
    pipelineIds.length > 0
      ? supabase.from("ghl_archive_pipelines").select("id,name").in("id", pipelineIds)
      : Promise.resolve({ data: [] as any[] }),
    stageIds.length > 0
      ? supabase.from("ghl_archive_pipeline_stages").select("id,name").in("id", stageIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const pipeName: Record<string, string> = Object.fromEntries((pipelines ?? []).map((p: any) => [p.id, p.name]));
  const stageName: Record<string, string> = Object.fromEntries((stages ?? []).map((s: any) => [s.id, s.name]));

  return (
    <div>
      <Link href="/archive/contacts" className="text-sm text-blue-600 hover:underline">← All archive contacts</Link>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-3 mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <h1 className="text-2xl font-bold">{name}</h1>
          <span className="text-xs text-gray-400 font-mono">{contact.id}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Email" value={contact.email} mono />
          <Field label="Phone" value={contact.phone} mono />
          <Field label="State" value={contact.state} />
          <Field label="Country" value={contact.country} />
          <Field label="Source" value={contact.source} />
          <Field label="Type" value={contact.type} />
          <Field label="Added" value={fmtDate(contact.date_added)} />
          <Field label="Updated" value={fmtDate(contact.date_updated)} />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
            {tags.map((t: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Counts strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <Count label="Notes" n={notes?.length ?? 0} />
        <Count label="Conversations" n={conversations?.length ?? 0} />
        <Count label="Opportunities" n={opportunities?.length ?? 0} />
        <Count label="Tasks" n={tasks?.length ?? 0} />
        <Count label="Appointments" n={appointments?.length ?? 0} />
      </div>

      {/* Opportunities */}
      {opportunities && opportunities.length > 0 && (
        <Section title={`Opportunities (${opportunities.length})`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Pipeline · Stage</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">Value</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o: any) => (
                  <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium">
                      <Link href={`/archive/opportunities/${o.id}`} className="text-blue-600 hover:underline">
                        {o.name || "—"}
                      </Link>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">
                      {pipeName[o.pipeline_id] || "—"}<br />
                      <span className="text-gray-400">{stageName[o.pipeline_stage_id] || "—"}</span>
                    </td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(o.status)}`}>
                        {o.status || "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{fmtCurrency(Number(o.monetary_value))}</td>
                    <td className="py-2 px-3 text-xs text-gray-500">{fmtDate(o.date_added)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Notes — split each bundle into individual entries */}
      {notes && notes.length > 0 && (
        <Section title={`Notes (${notes.length} ${notes.length === 1 ? "row" : "rows"})`}>
          <div className="space-y-3">
            {notes.map((n: any) => {
              const entries = splitGhlNoteBundle(stripHtml(n.body));
              return (
                <div key={n.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100 text-xs text-gray-500">
                    <span>Last edit: {fmtDateTime(n.date_added)}</span>
                    {n.pinned && (
                      <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📌 pinned</span>
                    )}
                    {entries.length > 1 && <span>· {entries.length} entries</span>}
                  </div>
                  <div className="space-y-2">
                    {entries.map((entry, i) => (
                      <div key={i} className="bg-gray-50 rounded-md border border-gray-100 p-3">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.body || "(empty entry)"}</p>
                        {(entry.date || entry.author) && (
                          <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-gray-200 text-[11px] text-gray-500">
                            {entry.date ? <span>{entry.date}</span> : <span></span>}
                            {entry.author && <span>by {entry.author}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Conversations */}
      {conversations && conversations.length > 0 && (
        <Section title={`Conversations (${conversations.length})`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Last message</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor(c.last_message_type ?? c.type)}`}>
                        {c.last_message_type ?? c.type ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-gray-700 max-w-md">{truncate(stripHtml(c.last_message_body), 120)}</td>
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(c.last_message_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Tasks */}
      {tasks && tasks.length > 0 && (
        <Section title={`Tasks (${tasks.length})`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Title</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Due</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3">
                      <p className="font-medium">{t.title || "(untitled)"}</p>
                      {t.body && <p className="text-xs text-gray-500 mt-0.5">{truncate(stripHtml(t.body), 100)}</p>}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(t.due_date)}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        t.completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {t.completed ? "✓ done" : "open"}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(t.date_added)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Appointments */}
      {appointments && appointments.length > 0 && (
        <Section title={`Appointments (${appointments.length})`}>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">When</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Title</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a: any) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(a.start_time)}</td>
                    <td className="py-2 px-3 font-medium">{a.title || "—"}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium capitalize bg-blue-100 text-blue-700">
                        {a.appointment_status || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function Count({ label, n }: { label: string; n: number }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${n === 0 ? "opacity-50" : ""}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{n}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
