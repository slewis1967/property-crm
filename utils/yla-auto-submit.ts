/**
 * YLA auto-submit sweep — the automation that closes the loop.
 *
 * Finds each application whose document set has gone COMPLETE but hasn't reached
 * YLA yet, then: verify → (on pass) package to Drive → email YLA the .ics invite;
 * (on fail) record the specific issues so the rep can fix them. Nothing goes to
 * YLA on a fail. Idempotent and self-throttling:
 *  - skips applications already sent (yla_submitted_at) or still incomplete,
 *  - skips a set that already FAILED and has no new uploads since (so we don't
 *    re-run the paid AI check on a static broken set every sweep),
 *  - re-checks a previously-failed set once the client uploads something new.
 *
 * SAFETY: nothing is exported or emailed unless YLA_AUTOSUBMIT_ENABLED==="true".
 * Otherwise every run is a dry run that verifies + reports what it WOULD do.
 */
import { supabase } from "./supabase";
import { YLA_DOCUMENTS } from "./yla-documents";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";
import { runApplicationVerification } from "./yla-verification-run";
import { exportApplicationToDrive } from "./yla-export";
import { buildYlaInvite } from "./yla-submit";
import { submitApplicationToBroker } from "./broker-submit";
import { sendBrevoEmail } from "./brevo";

export function ylaAutoSubmitEnabled(): boolean {
  return process.env.YLA_AUTOSUBMIT_ENABLED === "true";
}

type Candidate = {
  id: string;
  application_id: string | null;
  applicant_name: string;
  contact_id: string | null;
  verification_status: string | null;
  verified_at: string | null;
  submit_target: string | null;
  broker_name: string | null;
  broker_email: string | null;
  broker_reference: string | null;
};

export type SweepAction =
  | { application: string; applicant: string; action: "submitted"; drive_folder_url: string }
  | { application: string; applicant: string; action: "flagged"; issues: string[] }
  | { application: string; applicant: string; action: "would_submit" }
  | { application: string; applicant: string; action: "would_flag"; issues: string[] }
  | { application: string; applicant: string; action: "error"; error: string };

export type SweepResult = {
  ok: true;
  dryRun: boolean;
  enabled: boolean;
  scanned: number;
  complete: number;
  actions: SweepAction[];
};

/** Cheap completeness (no byte fetch): every applicant has YLA's required counts. */
async function applicationState(requestIds: string[]): Promise<{ complete: boolean; latestUpload: string | null }> {
  const { data: docs, error } = await supabase
    .from("client_documents")
    .select("request_id,doc_type,uploaded_at,status")
    .in("request_id", requestIds)
    .neq("status", "replaced");
  // Don't let a read error masquerade as an empty document set — that would
  // wrongly judge a complete application "incomplete" and skip it forever.
  if (error) throw new Error(`yla-auto-submit: document read failed: ${error.message}`);
  const rows = docs ?? [];
  const latestUpload = rows.reduce<string | null>((mx, r) => (!mx || r.uploaded_at > mx ? r.uploaded_at : mx), null);
  const complete = requestIds.every((rid) => {
    const mine = rows.filter((r) => r.request_id === rid);
    return YLA_DOCUMENTS.every((doc) => mine.filter((r) => r.doc_type === doc.key).length >= doc.count);
  });
  return { complete, latestUpload };
}

export async function runYlaAutoSubmit(opts?: { dryRun?: boolean; now?: Date; limit?: number }): Promise<SweepResult> {
  const now = opts?.now ?? new Date();
  const dryRun = opts?.dryRun ?? !ylaAutoSubmitEnabled();
  const maxApps = opts?.limit ?? 25;

  const { data: cands, error: candErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(
      "id,application_id,applicant_name,contact_id,verification_status,verified_at,submit_target,broker_name,broker_email,broker_reference",
    )
    .is("yla_submitted_at", null)
    .neq("status", "cancelled")
    .order("created_at", { ascending: true })
    .limit(500);
  // A query error here (e.g. a missing column because a migration never ran)
  // must NOT be silently read as "no applications to submit" — that turns the
  // whole sweep into a no-op that sends nothing, verifies nothing and logs
  // nothing, which is invisible until someone asks why a lead never reached
  // YLA. Fail loud so the scheduled function surfaces it.
  if (candErr) {
    throw new Error(`yla-auto-submit: candidate query failed: ${candErr.message}`);
  }
  const candidates = (cands ?? []) as Candidate[];

  // Group into applications (siblings share application_id; solo = own id).
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = c.application_id || c.id;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  const actions: SweepAction[] = [];
  let completeCount = 0;
  let processed = 0;

  for (const [, sibs] of groups) {
    if (processed >= maxApps) break;
    const rep = sibs[0]!;
    const ids = sibs.map((s) => s.id);
    const { complete, latestUpload } = await applicationState(ids);
    if (!complete) continue;
    completeCount++;

    // Skip a static previously-failed set (no new uploads since it was checked).
    if (rep.verification_status === "failed" && rep.verified_at && latestUpload && latestUpload <= rep.verified_at) {
      continue;
    }
    processed++;

    const run = await runApplicationVerification(rep.id, { visual: true });
    if (!run.ok) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: run.error });
      continue;
    }

    if (!run.result.pass) {
      const issues = run.result.docs.filter((d) => !d.pass).flatMap((d) => d.issues);
      if (dryRun) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "would_flag", issues });
      } else {
        await supabase
          .from(DOCUMENT_REQUESTS_TABLE)
          .update({
            verification_status: "failed",
            verified_at: now.toISOString(),
            verification_issues: run.result.docs.filter((d) => !d.pass).map((d) => ({ filename: d.filename, applicant: d.applicant, issues: d.issues })),
            updated_at: now.toISOString(),
          })
          .in("id", ids);
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "flagged", issues });
      }
      continue;
    }

    // PASS.
    if (dryRun) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "would_submit" });
      continue;
    }

    const exp = await exportApplicationToDrive(rep.id);
    if (!exp.ok) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `export: ${exp.error}` });
      continue;
    }

    // Route to the destination: a broker, else YLA.
    if ((rep.submit_target ?? "yla") === "broker") {
      if (!rep.broker_email) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: "broker destination has no email" });
        continue;
      }
      const bres = await submitApplicationToBroker({
        brokerName: rep.broker_name || "Broker",
        brokerEmail: rep.broker_email,
        brokerReference: rep.broker_reference,
        contactId: rep.contact_id,
        primaryApplicant: run.primaryApplicant,
        driveUrl: exp.folderUrl,
      });
      if (!bres.ok) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `broker send: ${bres.error}` });
        continue;
      }
    } else {
      const invite = buildYlaInvite({
        primaryApplicant: run.primaryApplicant,
        driveUrl: exp.folderUrl,
        clientRef: run.clientRef,
        applicationId: run.applicationId,
        requestId: rep.id,
        now,
      });
      const emailRes = await sendBrevoEmail({
        to: [{ email: invite.to, name: "Your Loan Assist" }],
        subject: invite.subject,
        html: invite.html,
        text: invite.text,
        attachments: [{ name: "invite.ics", content: invite.icsBase64 }],
        tags: ["yla-submission"],
      });
      if (!emailRes.ok) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `send: ${emailRes.error}` });
        continue;
      }
    }

    await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .update({ yla_submitted_at: now.toISOString(), verification_status: "passed", verified_at: now.toISOString(), updated_at: now.toISOString() })
      .in("id", ids);
    actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "submitted", drive_folder_url: exp.folderUrl });
  }

  return { ok: true, dryRun, enabled: ylaAutoSubmitEnabled(), scanned: groups.size, complete: completeCount, actions };
}
