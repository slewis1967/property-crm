import { supabase } from "../../../utils/supabase";
import { ArchiveHeader, SearchBar, Pager, EmptyState, fmtDate, fmtCurrency } from "../_lib";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const statusColor = (s: string | null) => {
  if (!s) return "bg-gray-100 text-gray-600";
  const k = s.toLowerCase();
  if (k === "won") return "bg-green-100 text-green-700";
  if (k === "lost") return "bg-red-100 text-red-700";
  if (k === "open") return "bg-blue-100 text-blue-700";
  if (k === "abandoned") return "bg-gray-100 text-gray-600";
  return "bg-purple-100 text-purple-700";
};

export default async function ArchiveOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_opportunities")
    .select(
      "id,name,contact_id,pipeline_id,pipeline_stage_id,status,monetary_value,date_added,date_updated",
      { count: "exact" },
    )
    .order("date_added", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.ilike("name", `%${q}%`);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  const total = count ?? 0;

  // Pipeline + stage labels
  const pipelineIds = Array.from(new Set((data ?? []).map((d: any) => d.pipeline_id).filter(Boolean)));
  const stageIds = Array.from(new Set((data ?? []).map((d: any) => d.pipeline_stage_id).filter(Boolean)));
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

  // Aggregate sum for the current page (cheap signal — total deal value across visible)
  const visibleSum = (data ?? []).reduce((s, o: any) => s + (Number(o.monetary_value) || 0), 0);

  return (
    <div>
      <ArchiveHeader
        title="GHL Archive · Opportunities"
        total={total}
        description="Every deal that flowed through a GHL pipeline. Filter by status, search by name."
      />

      <div className="flex gap-2 mb-4">
        {["", "open", "won", "lost", "abandoned"].map((s) => {
          const href = s ? `?status=${s}` : "?";
          const active = status === s;
          return (
            <a
              key={s || "all"}
              href={href}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                active ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {s ? s.charAt(0).toUpperCase() + s.slice(1) : "All"}
            </a>
          );
        })}
      </div>

      <SearchBar q={q} placeholder="Search opportunity name…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>
          {q || status ? "No opportunities match those filters." : "No opportunities yet."}
        </EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Name</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Pipeline · Stage</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-right py-2 px-4 text-gray-500 font-medium">Value</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o: any) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-4 font-medium">{o.name || "—"}</td>
                  <td className="py-2 px-4 text-gray-600 text-xs">
                    {pipeName[o.pipeline_id] || "—"}
                    <br />
                    <span className="text-gray-400">{stageName[o.pipeline_stage_id] || "—"}</span>
                  </td>
                  <td className="py-2 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColor(o.status)}`}>
                      {o.status || "—"}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-right font-mono">{fmtCurrency(Number(o.monetary_value))}</td>
                  <td className="py-2 px-4 text-gray-500 text-xs">{fmtDate(o.date_added)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={3} className="py-2 px-4 text-xs text-gray-500">
                  Sum across this page (excludes filtered-out / paginated):
                </td>
                <td className="py-2 px-4 text-right font-mono font-semibold">{fmtCurrency(visibleSum)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/archive/opportunities" q={q} />
    </div>
  );
}
