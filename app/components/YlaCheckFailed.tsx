/**
 * "Failed YLA check" — the sweep's verdict, shown where the rep looks.
 *
 * The verdict and its per-file reasons were written to document_requests but
 * no screen displayed them, so a set that FAILED still read "Ready to submit"
 * on the opportunity page (NK-10017, Sept 2026). This renders them against the
 * applicant they belong to.
 */

import type { VerificationIssue } from "../../utils/yla-overrides";

/** Re-exported so the screens that render a verdict and the code that recomputes
 * one after an override can never drift into two shapes. */
export type { VerificationIssue };

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** The portal slot a stored file sits in: "ATO Income Statement 1 - Libman (NK-10017).pdf" → "ATO Income Statement 1". */
function slotName(filename: string): string {
  return filename.replace(/\.pdf$/i, "").split(" - ")[0]!.trim() || filename;
}

/** The issues that belong on this applicant's row. Legacy entries without a
 * name can't be attributed, so they show on every row with their label. */
export function issuesForApplicant(
  all: VerificationIssue[] | null | undefined,
  applicantName: string,
  includeApplicationLevel: boolean,
): VerificationIssue[] {
  return (all ?? []).filter((i) => {
    if (!i.filename) return includeApplicationLevel;
    if (i.name) return norm(i.name) === norm(applicantName);
    return true;
  });
}

export default function YlaCheckFailed({
  issues,
  verifiedAt,
  compact = false,
  onDismiss,
  dismissing = false,
}: {
  issues: VerificationIssue[];
  verifiedAt: string | null;
  compact?: boolean;
  /** Offered only where the rep can act — the dashboard, not the read-only
   * progress panels. An application-level blocker is never dismissible. */
  onDismiss?: (issue: VerificationIssue) => void;
  dismissing?: boolean;
}) {
  const when = verifiedAt
    ? new Date(verifiedAt).toLocaleString("en-AU", {
        timeZone: "Australia/Brisbane",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;
  const text = compact ? "text-[11px]" : "text-sm";
  return (
    <div className={`mt-1.5 rounded-md border border-red-200 bg-red-50 ${compact ? "p-2" : "p-3"}`}>
      <p className={`${text} font-semibold text-red-800`}>
        Failed YLA check{when ? ` · ${when}` : ""} — not sent to YLA
      </p>
      {issues.length > 0 ? (
        <ul className={`mt-1 space-y-0.5 ${text} text-red-900 leading-snug`}>
          {issues.map((i, k) => (
            <li key={k}>
              {i.filename ? (
                <>
                  <span className="font-medium">{slotName(i.filename)}</span>
                  {!i.name && i.applicant && <span className="text-red-700"> ({i.applicant})</span>} — {i.issues.join("; ")}
                  {onDismiss && (
                    <button
                      type="button"
                      disabled={dismissing}
                      onClick={() => onDismiss(i)}
                      title="The check is wrong about this file — clear this objection"
                      className="ml-2 rounded border border-red-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="font-medium">Ours to fix:</span> {i.issues.join("; ")}
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-1 ${text} text-red-900`}>This applicant&apos;s files passed; the problem is with another applicant&apos;s.</p>
      )}
      <p className={`mt-1 ${compact ? "text-[10px]" : "text-xs"} text-red-700`}>
        The client is emailed what to replace, and it re-checks automatically after they upload.
      </p>
    </div>
  );
}
