import { supabase } from "../../utils/supabase";
import { PageHeader, SearchBar, Pager, EmptyState, fmtDate } from "../../utils/archive-helpers";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

const fmtSize = (bytes: number | null | undefined): string => {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
};

type MediaRow = {
  id: string;
  name: string | undefined;
  url: string | null;
  path_local: string | undefined;
  size: number | null;
  download_status: string | null;
  download_error: string | null;
  extracted_at: string | null;
};

const statusColor = (s: string | null) => {
  if (s === "ok") return "text-green-700 bg-green-50";
  if (s === "failed") return "text-red-700 bg-red-50";
  if (s === "skipped") return "text-gray-500 bg-gray-50";
  return "text-gray-500 bg-gray-50";
};

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1"));

  let query = supabase
    .from("ghl_archive_media_files")
    .select("id,name,url,path_local,size,download_status,download_error,extracted_at", {
      count: "exact",
    })
    .order("extracted_at", { ascending: false, nullsFirst: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (q) query = query.ilike("name", `%${q}%`);
  if (status) query = query.eq("download_status", status);

  const { data, count, error } = await query;
  const total = count ?? 0;

  const { data: stats } = await supabase
    .from("ghl_archive_media_files")
    .select("download_status,size");
  const statCounts: Record<string, number> = { ok: 0, failed: 0, skipped: 0, totalSize: 0 };
  (stats ?? []).forEach((s: { download_status: string | null; size: number | null }) => {
    if (s.download_status && statCounts.hasOwnProperty(s.download_status)) {
      statCounts[s.download_status]++;
    }
    if (s.download_status === "ok" && s.size) statCounts.totalSize += s.size;
  });

  return (
    <div>
      <PageHeader
        title="Media Library"
        total={total}
        description="Files uploaded — contracts, ID docs, marketing assets (sourced from GHL archive). Binaries are saved locally to /mnt/c/NEXUS-Memory/ghl_extract/phase3_*/files/."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Downloaded OK</p>
          <p className="text-2xl font-bold text-green-700">{statCounts.ok}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Failed</p>
          <p className="text-2xl font-bold text-red-700">{statCounts.failed}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Skipped (metadata-only)</p>
          <p className="text-2xl font-bold text-gray-500">{statCounts.skipped}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total size on disk</p>
          <p className="text-2xl font-bold">{fmtSize(statCounts.totalSize)}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {["", "ok", "failed", "skipped"].map((s) => {
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
              {s ? s : "All"}
            </a>
          );
        })}
      </div>

      <SearchBar q={q} placeholder="Search filename…" />

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 mb-4">
          Error: {error.message}
        </div>
      )}

      {!data || data.length === 0 ? (
        <EmptyState>{q || status ? "No files match those filters." : "No media files yet."}</EmptyState>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Name</th>
                <th className="text-right py-2 px-4 text-gray-500 font-medium">Size</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Status</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Local path</th>
                <th className="text-left py-2 px-4 text-gray-500 font-medium">Saved</th>
              </tr>
            </thead>
            <tbody>
              {data.map((f: MediaRow) => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="py-2 px-4 max-w-xs truncate font-medium" title={f.name}>
                    {f.name || "—"}
                  </td>
                  <td className="py-2 px-4 text-right font-mono text-xs">{fmtSize(f.size)}</td>
                  <td className="py-2 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(f.download_status)}`}>
                      {f.download_status || "—"}
                    </span>
                    {f.download_error && (
                      <p className="text-[10px] text-red-500 mt-0.5 max-w-xs truncate" title={f.download_error}>
                        {f.download_error}
                      </p>
                    )}
                  </td>
                  <td className="py-2 px-4 font-mono text-[11px] text-gray-500 max-w-xs truncate" title={f.path_local}>
                    {f.path_local || "—"}
                  </td>
                  <td className="py-2 px-4 text-gray-500 text-xs">{fmtDate(f.extracted_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} baseHref="/media" q={q} />
    </div>
  );
}
