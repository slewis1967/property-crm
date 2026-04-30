import { supabase } from "../../utils/supabase";
import { PageHeader, EmptyState, fmtDateTime } from "../../utils/archive-helpers";

export const dynamic = "force-dynamic";

export default async function FormsPage() {
  const [{ data: forms, count: formCount }, { data: subs, count: subCount }, { data: funnels }] =
    await Promise.all([
      supabase
        .from("ghl_archive_forms")
        .select("id,name,raw", { count: "exact" })
        .order("name"),
      supabase
        .from("ghl_archive_form_submissions")
        .select("id,form_id,name,email,phone,date_added,submission_data", { count: "exact" })
        .order("date_added", { ascending: false, nullsFirst: false })
        .limit(100),
      supabase.from("ghl_archive_funnels").select("id,name,domain,date_added"),
    ]);

  const submissionsByForm: Record<string, any[]> = {};
  (subs ?? []).forEach((s: any) => {
    const k = s.form_id ?? "unknown";
    if (!submissionsByForm[k]) submissionsByForm[k] = [];
    submissionsByForm[k].push(s);
  });

  return (
    <div>
      <PageHeader
        title="Forms & Funnels"
        total={(formCount ?? 0) + (subCount ?? 0) + (funnels?.length ?? 0)}
        description="Form definitions, recent submissions (most recent 100 across all forms), and funnel pages (sourced from GHL archive)."
      />

      <h2 className="text-lg font-semibold mt-6 mb-3">
        Forms <span className="text-sm text-gray-500 font-normal">({formCount ?? 0})</span>
      </h2>
      {!forms || forms.length === 0 ? (
        <EmptyState>No forms yet.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {forms.map((f: any) => {
            const formSubs = submissionsByForm[f.id] ?? [];
            return (
              <div key={f.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold">{f.name || "(unnamed form)"}</h3>
                  <span className="text-xs text-gray-400">{formSubs.length} recent</span>
                </div>
                {formSubs.length === 0 ? (
                  <p className="text-sm text-gray-400">No recent submissions.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {formSubs.slice(0, 6).map((s: any) => (
                      <li key={s.id} className="border-b border-gray-50 pb-1.5">
                        <p className="font-medium">{s.name || "(no name)"}</p>
                        <p className="text-xs text-gray-500">
                          {s.email || "—"} · {fmtDateTime(s.date_added)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold mt-8 mb-3">
        Funnels <span className="text-sm text-gray-500 font-normal">({funnels?.length ?? 0})</span>
      </h2>
      {!funnels || funnels.length === 0 ? (
        <EmptyState>No funnels yet.</EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Name</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Domain</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {funnels.map((f: any) => (
                <tr key={f.id} className="border-b border-gray-50">
                  <td className="py-2 px-4 font-medium">{f.name || "—"}</td>
                  <td className="py-2 px-4 text-gray-700">{f.domain || "—"}</td>
                  <td className="py-2 px-4 text-gray-500 text-xs">{fmtDateTime(f.date_added)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
