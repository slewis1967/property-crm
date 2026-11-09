/**
 * Dismissing the YLA check's verdict on ONE document, and what that leaves.
 *
 * The check is an AI reading of a PDF, so it is sometimes wrong — a payslip
 * photographed well enough to read gets called a screenshot, a licence scan
 * gets called rotated. When it is wrong there was nothing a rep could do: the
 * verdict is what gates the Drive package and the submission to YLA, so one
 * disputed file held a whole household (NK-10017, Sept 2026).
 *
 * A dismissal is recorded against the DOCUMENT ROW, not the request, and these
 * helpers decide what that means for the application's verdict. Pure — the I/O
 * lives in the dismiss route and the verification run.
 */

/** One entry of document_requests.verification_issues. A null filename is an
 * application-level blocker (an unsigned Needs Analysis), which is ours to fix
 * rather than ours to wave through, so nothing here ever dismisses one. */
export type VerificationIssue = {
  filename: string | null;
  applicant: string | null;
  name?: string | null;
  issues: string[];
};

/** A document whose verdict a rep has dismissed. */
export type DismissedDocument = {
  filename: string;
  /** The applicant whose request the file belongs to — see below. */
  applicantName: string;
};

const norm = (s: string | null | undefined) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Does this issue refer to this document?
 *
 * Filename alone is NOT enough. A filename is generated from the surname and
 * the shared client ref, so joint applicants who share a surname share every
 * filename: Mark and Marcia Libman each have their own
 * "Photo ID 2 Back - Libman (NK-10017).pdf". Matching on filename alone would
 * dismiss both when a rep cleared one — including a licence nobody has looked
 * at. The applicant NAME on the issue is what separates them.
 *
 * Issues written before Sept 2026 carry no name and can only be matched on
 * filename; dismissing one of those clears it for the application, which is the
 * honest reading of a record that never said whose file it was.
 */
export function issueMatchesDocument(issue: VerificationIssue, doc: DismissedDocument): boolean {
  if (!issue.filename) return false;
  if (norm(issue.filename) !== norm(doc.filename)) return false;
  if (!issue.name) return true;
  return norm(issue.name) === norm(doc.applicantName);
}

/**
 * The issues still standing once the dismissed documents are taken out.
 *
 * Empty means every objection has been answered and the application can go on
 * to be packaged. It is deliberately computed from the STORED verdict rather
 * than by re-running the check: re-verifying costs an AI pass per document and
 * tens of seconds, and it would re-read the very files a human has just ruled
 * on. The dismissal is durable on the document row, so a later re-verification
 * (triggered by a new upload) reaches the same answer without being told.
 */
export function remainingIssues(
  all: VerificationIssue[] | null | undefined,
  dismissed: DismissedDocument[],
): VerificationIssue[] {
  return (all ?? []).filter((issue) => !dismissed.some((doc) => issueMatchesDocument(issue, doc)));
}
