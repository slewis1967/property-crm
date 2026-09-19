import Link from "next/link";
import { Header, List, Empty, LoadError, SearchBox } from "../ui";
import { loadLeads, loadPipelines, parseTags, pipelineOf, stageOf, tempDot } from "../data";
import { formatDateTime } from "../../../utils/datetime";

export const dynamic = "force-dynamic";

const SHOW = 100;

/**
 * Leads (opportunities), newest first, one pipeline at a time. Filters are
 * query params (?p=<pipeline id>&q=<text>) so the list is server-rendered and
 * the back button returns to the same view. DNQ-tagged leads are left out, as
 * on the kanban.
 */
export default async function PhoneLeads({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; q?: string }>;
}) {
  const { p, q } = await searchParams;
  const [{ leads, error }, pipelines] = await Promise.all([loadLeads(), loadPipelines()]);

  const active = pipelines.find((x) => x.id === p) ?? pipelines[0] ?? null;
  const needle = q?.trim().toLowerCase() ?? "";

  const matches = leads
    .filter((l) => !active || pipelineOf(l, pipelines)?.id === active.id)
    .filter((l) => !parseTags(l.tags).some((t) => t.toUpperCase() === "DNQ"))
    .filter((l) =>
      !needle ||
      [l.full_name, l.email, l.phone, l.state, l.buyer_type].some((v) => v?.toLowerCase().includes(needle)),
    )
    .sort((a, b) => Date.parse(b.created_at || "") - Date.parse(a.created_at || ""));

  const hrefFor = (pipelineId: string) => {
    const sp = new URLSearchParams({ p: pipelineId });
    if (q) sp.set("q", q);
    return `/m/leads?${sp}`;
  };

  return (
    <>
      <Header title={active ? active.name : "Leads"} fullHref={active ? `/opportunities?pipeline=${encodeURIComponent(active.id)}` : "/opportunities"} />

      {pipelines.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none]">
          {pipelines.map((x) => (
            <Link
              key={x.id}
              href={hrefFor(x.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${
                x.id === active?.id ? "bg-[#0F4C5C] text-white" : "bg-white text-gray-700 shadow-sm"
              }`}
            >
              {x.name}
            </Link>
          ))}
        </div>
      )}

      <SearchBox
        action="/m/leads"
        defaultValue={q}
        placeholder="Search name, email, phone…"
        keep={active ? { p: active.id } : undefined}
      />

      <div className="px-4 pt-4">
        {error ? (
          <LoadError>Couldn&apos;t load leads: {error}</LoadError>
        ) : matches.length === 0 ? (
          <Empty>{needle ? "No leads match that search." : "No leads in this pipeline."}</Empty>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              {matches.length > SHOW ? `Newest ${SHOW} of ${matches.length}` : `${matches.length} lead${matches.length === 1 ? "" : "s"}`}
            </p>
            <List>
              {matches.slice(0, SHOW).map((l) => (
                <li key={l.lead_id}>
                  <Link href={`/m/leads/${l.lead_id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tempDot[l.temperature ?? ""] ?? "bg-gray-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{l.full_name || l.email || "(no name)"}</p>
                      <p className="truncate text-xs text-gray-500">
                        {stageOf(l, pipelines)} · {formatDateTime(l.created_at, "")}
                      </p>
                    </div>
                    <span className="text-gray-300">›</span>
                  </Link>
                </li>
              ))}
            </List>
          </>
        )}
      </div>
    </>
  );
}
