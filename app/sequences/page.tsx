import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { fmtDateTime, truncate } from "../archive/_lib";

export const dynamic = "force-dynamic";

const channelStyle: Record<string, string> = {
  email: "bg-blue-100 text-blue-700",
  sms: "bg-green-100 text-green-700",
  mixed: "bg-purple-100 text-purple-700",
};

const statusStyle: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  unsubscribed: "bg-gray-100 text-gray-600",
  failed: "bg-red-100 text-red-700",
};

const runStatusStyle: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
  no_op: "bg-gray-100 text-gray-600",
};

export default async function SequencesPage() {
  const [{ data: sequences }, { data: recentRuns }, { data: dueNext }, { data: unsubs }] =
    await Promise.all([
      supabase
        .from("sequences")
        .select("id,slug,name,description,channel,is_active,auto_enrol_tag,created_at")
        .order("slug"),
      supabase
        .from("sequence_step_runs")
        .select("id,enrollment_id,step_position,step_type,status,provider,provider_id,error,run_at")
        .order("run_at", { ascending: false })
        .limit(30),
      supabase
        .from("sequence_enrollments")
        .select("id,sequence_id,contact_id,current_step_position,next_step_due_at")
        .eq("status", "active")
        .order("next_step_due_at")
        .limit(20),
      supabase
        .from("unsubscribes")
        .select("*", { count: "exact", head: true }),
    ]);

  // Per-sequence enrolment counts
  const counts: Record<string, { active: number; paused: number; completed: number; failed: number }> = {};
  for (const s of sequences ?? []) counts[s.id] = { active: 0, paused: 0, completed: 0, failed: 0 };
  const { data: allEnrollments } = await supabase
    .from("sequence_enrollments")
    .select("sequence_id,status");
  for (const e of allEnrollments ?? []) {
    if (counts[e.sequence_id] && e.status in counts[e.sequence_id]) {
      (counts[e.sequence_id] as any)[e.status]++;
    }
  }

  // Resolve contact + sequence labels for the recent activity panels
  const contactIds = Array.from(new Set([
    ...(dueNext ?? []).map((d: any) => d.contact_id),
  ].filter(Boolean)));
  const enrollmentIds = Array.from(new Set((recentRuns ?? []).map((r: any) => r.enrollment_id).filter(Boolean)));

  const [{ data: contacts }, { data: enrollmentsForRuns }] = await Promise.all([
    contactIds.length > 0
      ? supabase.from("contacts").select("id,name,full_name,email").in("id", contactIds)
      : Promise.resolve({ data: [] as any[] }),
    enrollmentIds.length > 0
      ? supabase.from("sequence_enrollments").select("id,sequence_id,contact_id").in("id", enrollmentIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const contactById: Record<string, { name: string; email: string }> = Object.fromEntries(
    (contacts ?? []).map((c: any) => [c.id, {
      name: c.full_name || c.name || "(unnamed)",
      email: c.email || "",
    }])
  );
  const enrollmentById: Record<string, any> = Object.fromEntries(
    (enrollmentsForRuns ?? []).map((e: any) => [e.id, e])
  );
  const seqById: Record<string, any> = Object.fromEntries(
    (sequences ?? []).map((s: any) => [s.id, s])
  );

  // Hydrate the run-history records with their contact (via enrollment)
  const enrolmentContactIds = Array.from(new Set(Object.values(enrollmentById).map((e: any) => e.contact_id).filter(Boolean)));
  if (enrolmentContactIds.length > 0) {
    const more = await supabase.from("contacts").select("id,name,full_name,email").in("id", enrolmentContactIds);
    for (const c of more.data ?? []) {
      contactById[c.id] = { name: c.full_name || c.name || "(unnamed)", email: c.email || "" };
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-3xl font-bold">Outbound Sequences</h1>
        <span className="text-xs text-gray-400">replaces GHL workflows</span>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Cron-driven sequence engine. Runs every 5 minutes. YAML-defined steps in
        <code className="text-xs bg-gray-100 px-1 rounded mx-1">projects/sequences/</code>
        on the WSL backend; this page is read-only — use
        <code className="text-xs bg-gray-100 px-1 rounded mx-1">sequence_admin.py</code>
        to register/enrol/pause.
      </p>

      {/* Sequences list */}
      <h2 className="text-lg font-semibold mb-3">Registered sequences</h2>
      {!sequences || sequences.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No sequences yet. Register one with <code>sequence_admin.py upsert-yaml</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {sequences.map((s: any) => {
            const c = counts[s.id] || { active: 0, paused: 0, completed: 0, failed: 0 };
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold text-base">{s.name}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${channelStyle[s.channel] || "bg-gray-100"}`}>
                    {s.channel}
                  </span>
                </div>
                <p className="text-xs text-gray-400 font-mono mb-2">{s.slug}</p>
                {s.description && (
                  <p className="text-xs text-gray-600 mb-3 whitespace-pre-line">{truncate(s.description, 200)}</p>
                )}
                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <Stat label="Active" value={c.active} highlight={c.active > 0} />
                  <Stat label="Paused" value={c.paused} />
                  <Stat label="Done" value={c.completed} />
                  <Stat label="Failed" value={c.failed} accent={c.failed > 0 ? "red" : undefined} />
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
                  <span>{s.is_active ? "✓ active" : "✗ inactive"}</span>
                  {s.auto_enrol_tag && <span>auto-enrol tag: <code>{s.auto_enrol_tag}</code></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Due next */}
      {dueNext && dueNext.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">Next 20 due steps</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Contact</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Sequence</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Next step</th>
                  <th className="text-left py-2 px-3 text-gray-500 font-medium">Due at</th>
                </tr>
              </thead>
              <tbody>
                {dueNext.map((d: any) => {
                  const seq = seqById[d.sequence_id];
                  const contact = contactById[d.contact_id];
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3">
                        {d.contact_id ? (
                          <Link href={`/contacts/${d.contact_id}`} className="text-blue-600 hover:underline">
                            {contact?.name || "(unknown)"}
                          </Link>
                        ) : (
                          <span className="text-gray-400">(no contact)</span>
                        )}
                        {contact?.email && <p className="text-xs text-gray-400">{contact.email}</p>}
                      </td>
                      <td className="py-2 px-3 text-xs">{seq?.name || d.sequence_id}</td>
                      <td className="py-2 px-3 text-xs">step {d.current_step_position + 1}</td>
                      <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(d.next_step_due_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Recent runs */}
      <h2 className="text-lg font-semibold mb-3">
        Recent step activity
        <span className="text-sm text-gray-400 font-normal ml-2">last 30 step executions</span>
      </h2>
      {!recentRuns || recentRuns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          No step runs yet. Enrol a contact to see activity here.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">When</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Contact</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Sequence</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Step</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-gray-500 font-medium">Provider</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r: any) => {
                const enr = enrollmentById[r.enrollment_id];
                const contact = enr ? contactById[enr.contact_id] : null;
                const seq = enr ? seqById[enr.sequence_id] : null;
                return (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3 text-xs text-gray-500 whitespace-nowrap">{fmtDateTime(r.run_at)}</td>
                    <td className="py-2 px-3 text-xs">{contact?.name || "—"}</td>
                    <td className="py-2 px-3 text-xs">{seq?.name || "—"}</td>
                    <td className="py-2 px-3 text-xs">{r.step_position} · {r.step_type}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${runStatusStyle[r.status] || "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                      {r.error && <p className="text-[10px] text-red-500 mt-0.5 max-w-xs truncate" title={r.error}>{r.error}</p>}
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">{r.provider || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Compliance footer */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-semibold mb-1">📬 Compliance</p>
        <p className="text-xs">
          Every email send appends a Spam Act-compliant footer (sender identity, physical address, unsubscribe link).
          Every SMS send auto-appends "Reply STOP to opt out" if not already in the body.
          Total unsubscribes recorded: <strong>{unsubs?.[0] ? "—" : "0"}</strong>.
          The runner skips any contact with a row in <code>unsubscribes</code> for the relevant channel.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false, accent }: {
  label: string;
  value: number;
  highlight?: boolean;
  accent?: "red";
}) {
  const numColor = accent === "red"
    ? "text-red-700"
    : highlight
      ? "text-gray-900"
      : "text-gray-400";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`font-bold text-lg ${numColor}`}>{value}</p>
    </div>
  );
}
