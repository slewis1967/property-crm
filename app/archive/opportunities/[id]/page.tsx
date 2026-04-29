import Link from "next/link";
import { supabase } from "../../../../utils/supabase";
import { fmtDate, fmtDateTime, fmtCurrency, truncate, stripHtml, splitGhlNoteBundle } from "../../_lib";

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

export default async function ArchiveOpportunityDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: opp, error } = await supabase
    .from("ghl_archive_opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !opp) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Opportunity not found</h1>
        <p className="text-gray-500">No opportunity in the archive with id <code>{id}</code>.</p>
        <Link href="/archive/opportunities" className="text-blue-600 hover:underline mt-3 inline-block">← Back to opportunities</Link>
      </div>
    );
  }

  // Pull pipeline label, stage label, contact, and the contact's notes/tasks/conversations in parallel
  const [
    { data: pipeline },
    { data: stage },
    { data: contact },
    { data: notes },
    { data: tasks },
    { data: conversations },
  ] = await Promise.all([
    opp.pipeline_id
      ? supabase.from("ghl_archive_pipelines").select("id,name").eq("id", opp.pipeline_id).maybeSingle()
      : Promise.resolve({ data: null }),
    opp.pipeline_stage_id
      ? supabase.from("ghl_archive_pipeline_stages").select("id,name,position").eq("id", opp.pipeline_stage_id).maybeSingle()
      : Promise.resolve({ data: null }),
    opp.contact_id
      ? supabase
          .from("ghl_archive_contacts")
          .select("id,contact_name,first_name,last_name,email,phone,state,source,tags")
          .eq("id", opp.contact_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    opp.contact_id
      ? supabase
          .from("ghl_archive_notes")
          .select("id,body,user_id,pinned,date_added")
          .eq("contact_id", opp.contact_id)
          .order("date_added", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as any[] }),
    opp.contact_id
      ? supabase
          .from("ghl_archive_tasks")
          .select("id,title,body,due_date,completed,date_added")
          .eq("contact_id", opp.contact_id)
          .order("date_added", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as any[] }),
    opp.contact_id
      ? supabase
          .from("ghl_archive_conversations")
          .select("id,type,unread_count,last_message_body,last_message_type,last_message_date")
          .eq("contact_id", opp.contact_id)
          .order("last_message_date", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const contactName = contact
    ? contact.contact_name || `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "(unnamed)"
    : null;

  return (
    <div>
      <Link href="/archive/opportunities" className="text-sm text-blue-600 hover:underline">← All archive opportunities</Link>

      {/* Header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-3 mb-5">
        <div className="flex items-baseline justify-between mb-3">
          <h1 className="text-2xl font-bold">{opp.name || "(untitled deal)"}</h1>
          <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${statusColor(opp.status)}`}>
            {opp.status || "—"}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Field label="Value" value={fmtCurrency(Number(opp.monetary_value))} mono />
          <Field label="Pipeline" value={pipeline?.name || "—"} />
          <Field label="Stage" value={stage?.name || "—"} />
          <Field label="Source" value={opp.source} />
          <Field label="Added" value={fmtDate(opp.date_added)} />
          <Field label="Updated" value={fmtDate(opp.date_updated)} />
          <Field label="Last status change" value={fmtDate(opp.last_status_change_at)} />
          <Field label="Last stage change" value={fmtDate(opp.last_stage_change_at)} />
        </div>
      </div>

      {/* Linked contact */}
      {contact && (
        <Section title="Linked contact">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between mb-2">
              <Link
                href={`/archive/contacts/${contact.id}`}
                className="text-lg font-semibold text-blue-600 hover:underline"
              >
                {contactName}
              </Link>
              <span className="text-xs text-gray-400 font-mono">{contact.id}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field label="Email" value={contact.email} mono />
              <Field label="Phone" value={contact.phone} mono />
              <Field label="State" value={contact.state} />
              <Field label="Source" value={contact.source} />
            </div>
          </div>
        </Section>
      )}

      {/* Counts strip */}
      {contact && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
          <Count label="Notes (contact-scoped)" n={notes?.length ?? 0} />
          <Count label="Conversations" n={conversations?.length ?? 0} />
          <Count label="Tasks" n={tasks?.length ?? 0} />
        </div>
      )}

      {/* Notes — split each bundle */}
      {notes && notes.length > 0 && (
        <Section title={`Notes against this contact (${notes.length} ${notes.length === 1 ? "row" : "rows"})`}>
          <div className="space-y-3">
            {notes.map((n: any) => {
              const entries = splitGhlNoteBundle(stripHtml(n.body));
              return (
                <div key={n.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100 text-xs text-gray-500">
                    <span>Last edit: {fmtDateTime(n.date_added)}</span>
                    {n.pinned && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📌 pinned</span>}
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
                    <td className="py-2 px-3 text-xs">{c.last_message_type || c.type || "—"}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <p className="text-[11px] text-gray-400 italic mt-6">
        Notes, conversations and tasks are contact-scoped in GHL — they belong to the contact, not the opportunity.
        Everything shown above is filtered by this opportunity's <code>contact_id</code>.
      </p>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide font-medium">{label}</p>
      <p className={`text-sm mt-0.5 ${mono ? "font-mono" : ""} ${value ? "text-gray-900" : "text-gray-400"}`}>{value || "—"}</p>
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
