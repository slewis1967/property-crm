"use client";

/**
 * Documents panel on the opportunity detail page — lists the borrower's
 * compliance documents (Fact Find, Needs Analysis, Credit Authorisation, EOI)
 * that are linked to this opportunity's contact, with their status, so a
 * COMPLETED document is visible and directly openable — not just reachable via
 * the "open latest / create" buttons in the header. The rows carry no PII (the
 * loader selects only id/title/status/date), so this is safe to render.
 */

export interface OpportunityDoc {
  id: string;
  kind: "Fact Find" | "Needs Analysis" | "Credit Authorisation" | "EOI";
  title: string;
  status: string | null;
  created_at: string | null;
  openHref: string;
  pdfHref: string;
}

const KIND_ICON: Record<OpportunityDoc["kind"], string> = {
  "Fact Find": "📋",
  "Needs Analysis": "🧭",
  "Credit Authorisation": "🔏",
  EOI: "📝",
};

/** Green = done, amber = mid-flight, grey = draft/unknown. Covers the status
 * vocabularies across all four doc types (Complete / Signed / Cleared, etc.). */
function statusClass(status: string | null): string {
  const v = (status || "").toLowerCase();
  if (["complete", "signed", "cleared", "lodged"].includes(v)) return "bg-green-100 text-green-700";
  if (["in review", "awaiting signature", "sent", "enhanced dd"].includes(v)) return "bg-amber-100 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function OpportunityDocuments({ documents }: { documents: OpportunityDoc[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Documents</h2>
        <span className="text-xs text-gray-400">
          {documents.length} on file
        </span>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">
          No fact finds, needs analyses, EOIs or credit authorisations for this contact yet — use the buttons above to start one.
        </p>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <div
              key={`${d.kind}-${d.id}`}
              className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  <span className="mr-1.5">{KIND_ICON[d.kind]}</span>
                  {d.kind}
                  {d.title && d.title !== d.kind && (
                    <span className="text-gray-400 font-normal"> · {d.title}</span>
                  )}
                </p>
                {fmtDate(d.created_at) && (
                  <p className="text-xs text-gray-400">{fmtDate(d.created_at)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${statusClass(d.status)}`}>
                  {d.status || "Draft"}
                </span>
                <a href={d.openHref} className="text-xs font-semibold text-teal-700 hover:underline">
                  Open
                </a>
                <a
                  href={d.pdfHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-400 hover:text-gray-700"
                  title="Download PDF"
                >
                  PDF
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
