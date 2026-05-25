"use client";

import { useEffect, useState } from "react";

type SavedReport = {
  id: string;
  title: string;
  generated_at: string;
  generated_by: string | null;
  property_id: string | null;
  last_emailed_at: string | null;
  last_emailed_to: string | null;
  email_count: number | null;
  /** deal_analyser_pia | comparison | null (a plain PIA-modeller report) */
  kind: string | null;
};

/** Deal-analyser reports open in their client-facing viewers; modeller reports
 *  open in the PIA modeller. */
function reportHref(r: SavedReport): string {
  if (r.kind === "comparison") return `/deal-analyser/compare/${r.id}`;
  if (r.kind === "deal_analyser_pia") return `/deal-analyser/report/${r.id}`;
  return `/pia?report=${r.id}`;
}

function reportTag(kind: string | null): string | null {
  if (kind === "comparison") return "Comparison";
  if (kind === "deal_analyser_pia") return "Deal Analyser";
  return null;
}

export default function OpportunityPiaReports({ leadId, propertyId }: { leadId: string; propertyId?: string | null }) {
  const [reports, setReports] = useState<SavedReport[] | null>(null);

  useEffect(() => {
    fetch(`/api/pia/reports?opportunity_id=${encodeURIComponent(leadId)}&limit=50`)
      .then((r) => r.json())
      .then((j) => setReports(j.ok ? j.reports : []))
      .catch(() => setReports([]));
  }, [leadId]);

  const newHref = (() => {
    const p = new URLSearchParams({ opportunity: leadId });
    if (propertyId) p.set("property", propertyId);
    return `/pia?${p}`;
  })();

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Investment Analysis (PIA)</h2>
        <a
          href={newHref}
          className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Run new analysis
        </a>
      </div>

      {reports === null && <p className="text-xs text-gray-400">Loading…</p>}
      {reports !== null && reports.length === 0 && (
        <p className="text-xs text-gray-400">No saved analyses yet. Click &quot;Run new analysis&quot; to model this deal.</p>
      )}
      {reports !== null && reports.length > 0 && (
        <ul className="divide-y divide-gray-100 -mx-2">
          {reports.map((r) => (
            <li key={r.id} className="px-2 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={reportHref(r)}
                  className="text-sm font-medium text-blue-600 hover:underline truncate block"
                >
                  {reportTag(r.kind) && (
                    <span className="inline-block mr-2 px-1.5 py-0.5 rounded text-[10px] font-semibold align-middle bg-[#0F4C5C] text-white">
                      {reportTag(r.kind)}
                    </span>
                  )}
                  {r.title}
                </a>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(r.generated_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                  {r.generated_by ? ` · by ${r.generated_by}` : ""}
                </p>
                {r.last_emailed_to && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Emailed to {r.last_emailed_to}
                    {r.last_emailed_at ? ` · ${new Date(r.last_emailed_at).toLocaleDateString("en-AU")}` : ""}
                    {r.email_count && r.email_count > 1 ? ` · ${r.email_count}×` : ""}
                  </p>
                )}
              </div>
              <a
                href={reportHref(r)}
                className="text-xs text-gray-500 hover:text-gray-800 whitespace-nowrap"
              >
                Open →
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
