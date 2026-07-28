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
 * RUNS IN TWO STAGES, and this is load-bearing rather than tidiness. The sweep
 * executes inside a serverless request with a ceiling of a few tens of seconds,
 * and a two-applicant application costs ~40s to verify plus a packaging step
 * that renders two PDFs and uploads a Drive folder. As one unit it never fit:
 * every invocation was killed partway, recorded nothing, and the next one
 * repeated the identical work — so a complete, passing application sat unsent
 * indefinitely while the logs showed nothing wrong. Each stage now records its
 * result the moment it has one, so an invocation that dies costs at most the
 * stage it was in, and the next one resumes instead of restarting:
 *   1. verify → write "passed"/"failed" (then email the client on a fail)
 *   2. package to Drive → hold for release, or send
 *
 *
 * SAFETY: nothing is exported or emailed unless YLA_AUTOSUBMIT_ENABLED==="true".
 * Otherwise every run is a dry run that verifies + reports what it WOULD do.
 */
import { supabase } from "./supabase";
import { YLA_DOCUMENTS } from "./yla-documents";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";
import { runApplicationVerification } from "./yla-verification-run";
import { exportApplicationToDrive } from "./yla-export";
import { buildYlaInvite, YLA_INVITE_EMAIL } from "./yla-submit";
import { springboardSenderEmail, springboardSenderName, springboardReplyTo } from "./springboard-sender";
import { driveFolderIdFromUrl, shareFolderWithReader } from "./google-drive";
import { submitApplicationToBroker } from "./broker-submit";
import { sendBrevoEmail } from "./brevo";
import { sendClientDocFixups, clientDocFixupEnabled } from "./yla-remediation-email";
import { notifyYlaSubmissionHeld } from "./yla-hold-notify";

/**
 * Hold the last step: package the application to Drive, then wait for a human
 * to press send. Set while building confidence in the pipeline — the first real
 * submission to a live partner is worth eyeballing, and a rejected set costs a
 * week. Unset it to go fully unattended again.
 *
 * Deliberately separate from YLA_AUTOSUBMIT_ENABLED: that gate makes the sweep
 * a dry run, which produces no Drive folder to inspect. This one produces the
 * complete package and stops at the send.
 */
export function ylaSubmitHold(): boolean {
  return process.env.YLA_SUBMIT_HOLD === "true";
}

export function ylaAutoSubmitEnabled(): boolean {
  return process.env.YLA_AUTOSUBMIT_ENABLED === "true";
}

type Candidate = {
  id: string;
  application_id: string | null;
  applicant_name: string;
  client_ref: string | null;
  contact_id: string | null;
  verification_status: string | null;
  verified_at: string | null;
  drive_folder_url: string | null;
  submit_target: string | null;
  broker_name: string | null;
  broker_email: string | null;
  broker_reference: string | null;
};

export type SweepAction =
  | { application: string; applicant: string; action: "submitted"; drive_folder_url: string }
  | { application: string; applicant: string; action: "held"; drive_folder_url: string }
  | { application: string; applicant: string; action: "flagged"; issues: string[]; emailedClients?: string[] }
  | { application: string; applicant: string; action: "would_submit" }
  | { application: string; applicant: string; action: "would_flag"; issues: string[]; emailedClients?: string[] }
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
      "id,application_id,applicant_name,client_ref,contact_id,verification_status,verified_at,drive_folder_url,submit_target,broker_name,broker_email,broker_reference",
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
    // Skip a set already PACKAGED and waiting on a human: it passed, its Drive
    // folder exists, and yla_submitted_at is null only because nobody has
    // pressed send. Without this it would re-verify, re-notify and re-pay for
    // the AI pass every two hours until released.
    //
    // "passed" WITHOUT a Drive folder is a different thing — a run that
    // verified and was then cut short before it could package (see below). That
    // one resumes at the export rather than paying for the AI pass again.
    const packaged = sibs.some((s) => !!s.drive_folder_url);
    if (rep.verification_status === "passed" && packaged) continue;
    processed++;

    let primaryApplicant = rep.applicant_name;
    let clientRef = rep.client_ref;

    // STAGE 1 — verify. Skipped entirely when a previous invocation already
    // recorded a pass, which is what makes the two stages add up to less than
    // one serverless request each.
    if (rep.verification_status !== "passed") {
      const run = await runApplicationVerification(rep.id, { visual: true });
      if (!run.ok) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: run.error });
        continue;
      }
      primaryApplicant = run.primaryApplicant;
      clientRef = run.clientRef;

      if (!run.result.pass) {
        const issues = run.result.docs.filter((d) => !d.pass).flatMap((d) => d.issues);
        if (dryRun) {
          const fixups = await sendClientDocFixups({
            applicationId: rep.application_id,
            repId: rep.id,
            docs: run.result.docs,
            now,
            dryRun: true,
          });
          const emailedClients = fixups
            .filter((f) => f.action === "emailed" || f.action === "would_email")
            .map((f) => `${f.applicant} (dry)`);
          actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "would_flag", issues, emailedClients });
          continue;
        }
        // Record the verdict BEFORE emailing anyone. The emails are the slow
        // part, and a run cut short between the two used to leave the client
        // told to re-upload while the application still looked unchecked — so
        // the next sweep paid for the whole AI pass again and re-sent the same
        // email. Whatever else happens, the verdict is now durable.
        await supabase
          .from(DOCUMENT_REQUESTS_TABLE)
          .update({
            verification_status: "failed",
            verified_at: now.toISOString(),
            verification_issues: run.result.docs.filter((d) => !d.pass).map((d) => ({ filename: d.filename, applicant: d.applicant, issues: d.issues })),
            updated_at: now.toISOString(),
          })
          .in("id", ids);
        // Tell the client exactly what to re-upload (gated separately by
        // CLIENT_DOC_FIXUP_ENABLED).
        const fixups = await sendClientDocFixups({
          applicationId: rep.application_id,
          repId: rep.id,
          docs: run.result.docs,
          now,
          dryRun: !clientDocFixupEnabled(),
        });
        const emailedClients = fixups
          .filter((f) => f.action === "emailed" || f.action === "would_email")
          .map((f) => `${f.applicant}${f.action === "would_email" ? " (dry)" : ""}`);
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "flagged", issues, emailedClients });
        continue;
      }

      // PASS.
      if (dryRun) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "would_submit" });
        continue;
      }

      // Bank the pass before the packaging starts, for the same reason as the
      // failure above: packaging renders two PDFs and uploads a folder to
      // Drive, and losing a 40s AI pass to a timeout during it meant the sweep
      // never converged — every invocation redid the same work and was cut off
      // at the same place. A pass with no Drive folder is picked up at STAGE 2
      // by the next invocation. It reads as "verified, packaging" rather than
      // "ready to send": releasing early is refused by the submit primitive,
      // which requires an exported package.
      await supabase
        .from(DOCUMENT_REQUESTS_TABLE)
        .update({ verification_status: "passed", verified_at: now.toISOString(), verification_issues: null, updated_at: now.toISOString() })
        .in("id", ids);
    } else if (dryRun) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "would_submit" });
      continue;
    }

    // STAGE 2 — package to Drive, then hold or send.

    const exp = await exportApplicationToDrive(rep.id);
    if (!exp.ok) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `export: ${exp.error}` });
      continue;
    }

    // HOLD — the package is built and in Drive, but a human presses send.
    // Nothing about the set is wrong; this exists so a first (or otherwise
    // sensitive) submission can be eyeballed before it reaches a real partner.
    // Releasing is the "Send to YLA" button, which calls the same submit
    // primitive this sweep would have used.
    if (ylaSubmitHold()) {
      await supabase
        .from(DOCUMENT_REQUESTS_TABLE)
        // Deliberately NOT yla_submitted_at — it isn't submitted. "passed" with
        // no submission timestamp IS the held state, and the candidate scan
        // above skips it (now that the folder exists), so this notifies once
        // rather than every two hours.
        .update({ verification_status: "passed", verified_at: now.toISOString(), updated_at: now.toISOString() })
        .in("id", ids);
      await notifyYlaSubmissionHeld({
        primaryApplicant,
        clientRef,
        driveUrl: exp.folderUrl,
        requestId: rep.id,
      });
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "held", drive_folder_url: exp.folderUrl });
      continue;
    }

    // The recipient cannot read the folder until we say so: the export creates
    // it inside a shared drive only we belong to, so an ungranted link opens
    // EMPTY. Granting is the disclosure of the client's payslips, ID and TFN,
    // so it happens here at the send rather than during packaging — and if it
    // fails we send nothing, because an empty folder reads to the recipient as
    // an incomplete submission.
    const destination = (rep.submit_target ?? "yla") === "broker" ? rep.broker_email : YLA_INVITE_EMAIL;
    if (!destination) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: "broker destination has no email" });
      continue;
    }
    const folderId = driveFolderIdFromUrl(exp.folderUrl);
    const shared = folderId
      ? await shareFolderWithReader(folderId, destination)
      : { ok: false as const, error: "the Drive link isn't a folder link" };
    if (!shared.ok) {
      actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `share: ${shared.error}` });
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
        primaryApplicant,
        driveUrl: exp.folderUrl,
      });
      if (!bres.ok) {
        actions.push({ application: rep.application_id || rep.id, applicant: rep.applicant_name, action: "error", error: `broker send: ${bres.error}` });
        continue;
      }
    } else {
      const invite = buildYlaInvite({
        primaryApplicant,
        driveUrl: exp.folderUrl,
        clientRef,
        applicationId: rep.application_id,
        requestId: rep.id,
        now,
      });
      const emailRes = await sendBrevoEmail({
        to: [{ email: invite.to, name: "Your Loan Assist" }],
        // From Springboard, whose client this is and whom YLA know through the
        // COMP-8317 introducer chain — not the default NextKey sender.
        fromEmail: springboardSenderEmail(),
        fromName: springboardSenderName(),
        replyTo: springboardReplyTo(),
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
