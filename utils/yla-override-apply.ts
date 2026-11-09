/**
 * Re-deciding an application's verdict after a rep overrides part of it —
 * dismissing one document's objection, or removing the document entirely.
 *
 * The verdict is application-level and stored on every sibling request, so both
 * actions have to answer the same question: with this objection gone, is
 * anything still holding the set? Answered from the STORED verdict, never by
 * re-running the check — re-verifying costs an AI pass per document and would
 * re-read the very file a human has just ruled on.
 *
 * Three outcomes, and the difference between the last two matters:
 *   - something still stands      → stays failed, with the shorter list
 *   - nothing stands, set complete → passed; the auto-submit sweep packages it
 *   - nothing stands, set short    → back to unverified, NOT passed: a deleted
 *     file leaves a gap, and the replacement has to be checked when it lands
 */
import { supabase } from "./supabase";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";
import { applicationState } from "./yla-auto-submit";
import { closeFailTasks } from "./yla-fail-alert";
import { remainingIssues, type DismissedDocument, type VerificationIssue } from "./yla-overrides";
import { columnMissing } from "./column-missing";

export type OverrideOutcome = {
  verification_status: "passed" | "failed" | null;
  remaining: VerificationIssue[];
  complete: boolean;
};

/**
 * `removed` covers the delete case: the row is already gone from the live set,
 * so it can't be found by its override stamp the way a dismissal can.
 */
export async function recomputeVerdictAfterOverride(
  requestId: string,
  opts?: { removed?: DismissedDocument[]; now?: Date },
): Promise<OverrideOutcome> {
  const now = opts?.now ?? new Date();

  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,application_id,applicant_name,contact_id,verification_status,verification_issues")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { verification_status: null, remaining: [], complete: false };

  let siblings = [request];
  if (request.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,application_id,applicant_name,contact_id,verification_status,verification_issues")
      .eq("application_id", request.application_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (sibs && sibs.length) siblings = sibs;
  }
  const ids = siblings.map((s) => s.id);

  // Every live document across the application that a rep has waved through.
  // Read fresh rather than accumulated in the caller, so a second dismissal
  // sees the first one and the outcome never depends on call order.
  // Without the migration there can be no dismissals; a delete still needs the
  // rest of this to run, so treat the column's absence as "none".
  const { data: overridden, error: overriddenErr } = await supabase
    .from("client_documents")
    .select("request_id,filename,check_override_at")
    .in("request_id", ids)
    .neq("status", "replaced")
    .not("check_override_at", "is", null);
  if (overriddenErr && !columnMissing(overriddenErr, ["check_override_at"])) {
    throw new Error(`override recompute: could not read dismissals: ${overriddenErr.message}`);
  }

  const nameFor = new Map(siblings.map((s) => [s.id, s.applicant_name as string]));
  const dismissed: DismissedDocument[] = [
    ...(overridden ?? []).map((d) => ({
      filename: d.filename as string,
      applicantName: nameFor.get(d.request_id as string) ?? "",
    })),
    ...(opts?.removed ?? []),
  ];

  // The verdict is duplicated across siblings; any row carries the whole list.
  const stored = (siblings.find((s) => s.verification_issues)?.verification_issues ??
    null) as VerificationIssue[] | null;
  const remaining = remainingIssues(stored, dismissed);

  const { complete } = await applicationState(ids);

  const patch: Record<string, unknown> = { updated_at: now.toISOString() };
  let status: OverrideOutcome["verification_status"];
  if (remaining.length > 0) {
    status = "failed";
    patch.verification_status = "failed";
    patch.verification_issues = remaining;
  } else if (complete) {
    status = "passed";
    patch.verification_status = "passed";
    patch.verified_at = now.toISOString();
    patch.verification_issues = null;
  } else {
    status = null;
    patch.verification_status = null;
    patch.verified_at = null;
    patch.verification_issues = null;
  }

  await supabase.from(DOCUMENT_REQUESTS_TABLE).update(patch).in("id", ids);

  // The failure raised a task on the contact when it was recorded. Clearing the
  // verdict without clearing that leaves the rep chasing a fixed problem.
  if (status !== "failed") {
    const contactId = siblings.find((s) => s.contact_id)?.contact_id ?? null;
    await closeFailTasks(contactId as string | null, now);
  }

  return { verification_status: status, remaining, complete };
}
