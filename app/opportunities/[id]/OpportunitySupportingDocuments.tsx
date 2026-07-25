"use client";

/**
 * Supporting Documents panel on the opportunity detail page — the files the
 * CLIENT uploaded through their secure document portal (payslips, photo ID, ATO
 * income statements, super statements, etc.), grouped by applicant, each with a
 * direct download link so the advisor can open them without leaving the CRM.
 *
 * These are the raw client uploads (client_documents in the private
 * `client-documents` storage bucket), distinct from the generated compliance
 * documents in OpportunityDocuments. Bytes are never embedded here — each row
 * links to the authed, opportunity-scoped download route which mints a
 * short-lived signed URL on click.
 */

export interface SupportingDoc {
  id: string;
  /** The applicant who uploaded it (co-applicants share one opportunity). */
  applicant: string;
  /** Stable slug, e.g. "payslip". */
  docType: string;
  /** Human label, e.g. "Recent payslips". */
  docLabel: string;
  /** What the file was called on upload — the advisor's best content cue. */
  filename: string;
  sizeBytes: number | null;
  /** e.g. "accepted" / "flagged". */
  status: string | null;
  uploadedAt: string | null;
  checkNotes: string | null;
}

const TYPE_ICON: Record<string, string> = {
  payslip: "💷",
  photo_id: "🪪",
  ato_income: "🧾",
  super_statement: "🏦",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: string | null): string {
  const v = (status || "").toLowerCase();
  if (["accepted", "verified", "passed"].includes(v)) return "bg-green-100 text-green-700";
  if (["flagged", "rejected", "failed"].includes(v)) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

export default function OpportunitySupportingDocuments({
  opportunityId,
  documents,
}: {
  opportunityId: string;
  documents: SupportingDoc[];
}) {
  // Group by applicant, preserving upload order within each group.
  const groups = new Map<string, SupportingDoc[]>();
  for (const d of documents) {
    (groups.get(d.applicant) ?? groups.set(d.applicant, []).get(d.applicant)!).push(d);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Supporting Documents</h2>
        <span className="text-xs text-gray-400">
          {documents.length} uploaded by {documents.length === 1 ? "the client" : "the clients"}
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">
          The client hasn&apos;t uploaded any documents through their portal yet.
        </p>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([applicant, docs]) => (
            <div key={applicant}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {applicant}
              </p>
              <div className="space-y-2">
                {docs.map((d) => (
                  <a
                    key={d.id}
                    href={`/api/opportunities/${opportunityId}/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 hover:bg-gray-100 transition group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        <span className="mr-1.5">{TYPE_ICON[d.docType] ?? "📎"}</span>
                        {d.docLabel}
                        <span className="text-gray-400 font-normal"> · {d.filename}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {[fmtDate(d.uploadedAt), fmtSize(d.sizeBytes)].filter(Boolean).join(" · ")}
                        {d.checkNotes ? ` · ${d.checkNotes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {d.status && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${statusClass(d.status)}`}
                        >
                          {d.status}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-blue-600 group-hover:underline">
                        Download
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
