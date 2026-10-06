/**
 * Preliminary Assessment — match incoming PAs to a client, and retire the ones
 * YLA has replaced.
 *
 * The mailbox feeder (NEXUS elvis_pa_intake.py) only files what YLA sent; it has
 * no view of who our clients are. This is where a PA is tied to a contact so the
 * rep finds it on the contact page and the call room (`contact-<id>`) can show it.
 *
 * Runs from the cron (`?job=pa`) and, best effort, at the top of the staff list
 * route — so a PA that arrived a minute ago is matched by the time a rep looks.
 * It is idempotent: every write is conditional on the state it read.
 *
 * The decisions are pure functions (tested in pa-match.test.ts); the bottom of
 * the file is the thin Supabase wrapper around them.
 */
import { supabase } from "./supabase";
import { log } from "./logger";
import { errMessage } from "./errors";
import { hydratePa, PRELIMINARY_ASSESSMENTS_TABLE } from "./preliminary-assessments";

export const PA_MIGRATION_HINT =
  "Preliminary Assessments storage isn't set up yet — run migrations/20261006_preliminary_assessments.sql in the Supabase SQL editor.";

/** What the matcher stamps in matched_by. Anything else is a rep's email. */
export const AUTO_MATCHED_BY = "auto:email";
/** What the matcher stamps in document_requests.pa_received_by. */
export const PA_RECEIVED_BY = "yla-email-intake";

/**
 * Table-level codes only (42P01 / PGRST205). Matching on the message would also
 * catch column errors and report "run the migration" for one already run — the
 * factFindsTableMissing() rule.
 */
export function paTableMissing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const norm = (v: unknown): string => (typeof v === "string" ? v.trim().toLowerCase() : "");

/* ── Pure decisions ──────────────────────────────────────────────────────── */

/** The applicants' emails in applicant order, lower-cased, no blanks or repeats. */
export function applicantEmails(data: unknown): string[] {
  const seen = new Set<string>();
  for (const a of hydratePa(data).applicants) {
    if (a.email.includes("@")) seen.add(a.email);
  }
  return [...seen];
}

export type ContactCandidate = { id: string; email: string | null };

/**
 * Which contact a PA belongs to: the FIRST applicant with a contact wins, since
 * joint applicants are often two contacts and the first-named one is the lead.
 * Email only — never the surname. Two unrelated clients share a surname far more
 * often than an address, and a wrong match shows one family's credit proposal on
 * another family's call. No email hit = null = a rep matches it by hand.
 *
 * `contacts` is expected newest-first; a duplicated contact resolves to the
 * record staff touched last.
 */
export function pickContact(emails: string[], contacts: ContactCandidate[]): string | null {
  for (const email of emails) {
    const hit = contacts.find((c) => norm(c.email) === norm(email) && norm(email) !== "");
    if (hit) return hit.id;
  }
  return null;
}

export type DocRequestCandidate = {
  id: string;
  application_id: string | null;
  applicant_email: string | null;
  yla_submitted_at: string | null;
  pa_received_at: string | null;
  created_at: string | null;
};

/**
 * The document request this PA answers. A request that was actually submitted to
 * YLA beats one that wasn't (a client can have an abandoned earlier request, and
 * YLA cannot have assessed a package it never received); newest breaks ties.
 */
export function pickDocumentRequest(
  emails: string[],
  requests: DocRequestCandidate[],
): DocRequestCandidate | null {
  const wanted = new Set(emails.map(norm).filter(Boolean));
  const hits = requests.filter((r) => wanted.has(norm(r.applicant_email)));
  if (hits.length === 0) return null;
  const time = (v: string | null) => (v ? Date.parse(v) || 0 : 0);
  return [...hits].sort((a, b) => {
    const submitted = Number(Boolean(b.yla_submitted_at)) - Number(Boolean(a.yla_submitted_at));
    return submitted || time(b.created_at) - time(a.created_at);
  })[0];
}

export type SupersedeCandidate = {
  id: string;
  yla_ref: string;
  received_at: string;
  status: string;
};

/** Statuses a replaced PA may be retired from. Never a PA that is out for
 * signature or signed: those are live legal documents with requests against them. */
export const SUPERSEDABLE_STATUSES = ["Received", "Presented"] as const;

/**
 * Ids to mark Superseded: within one YLA ref, every row at Received/Presented
 * that has a strictly newer row. YLA re-issues under the same ref after a
 * reassessment, and presenting the stale figures is the failure this prevents.
 * Rows with equal timestamps are left alone — neither is provably the older.
 */
export function rowsToSupersede(rows: SupersedeCandidate[]): string[] {
  const newest = new Map<string, number>();
  const time = (r: SupersedeCandidate) => Date.parse(r.received_at);
  for (const r of rows) {
    const t = time(r);
    if (!r.yla_ref || Number.isNaN(t)) continue;
    if (t > (newest.get(r.yla_ref) ?? -Infinity)) newest.set(r.yla_ref, t);
  }
  return rows
    .filter((r) => {
      const t = time(r);
      const top = newest.get(r.yla_ref);
      return (
        (SUPERSEDABLE_STATUSES as readonly string[]).includes(r.status) &&
        !Number.isNaN(t) &&
        top !== undefined &&
        t < top
      );
    })
    .map((r) => r.id);
}

/* ── Supabase wrapper ────────────────────────────────────────────────────── */

export type PaMatchResult = { matched: number; superseded: number; unmatched: number };

type PendingRow = SupersedeCandidate & {
  contact_id: string | null;
  document_request_id: string | null;
  matched_by: string | null;
  data: unknown;
};

/** `_`, `%` and PostgREST's `*` are wildcards to ILIKE, and `_` is common in
 * email addresses. Results are re-checked for equality in code as well. */
const likeLiteral = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`).replace(/\*/g, "\\*");

async function contactsByEmail(email: string): Promise<ContactCandidate[]> {
  const { data, error } = await supabase
    .from("contacts")
    .select("id,email")
    .ilike("email", likeLiteral(email))
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as ContactCandidate[];
}

async function docRequestsByEmail(email: string): Promise<DocRequestCandidate[]> {
  const { data, error } = await supabase
    .from("document_requests")
    .select("id,application_id,applicant_email,yla_submitted_at,pa_received_at,created_at")
    .ilike("applicant_email", likeLiteral(email))
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []) as DocRequestCandidate[];
}

/**
 * Link the PA to its document request. With PA_AUTO_MARK_RECEIVED=true it also
 * records on that request (and the other applicants of the same application)
 * that the PA is back, only ever filling a NULL pa_received_at: a rep who
 * marked it earlier keeps their timestamp.
 */
async function linkDocumentRequest(paId: string, emails: string[]): Promise<void> {
  const found: DocRequestCandidate[] = [];
  for (const email of emails) found.push(...(await docRequestsByEmail(email)));
  const request = pickDocumentRequest(emails, found);
  if (!request) return;

  const { error: linkErr } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .update({ document_request_id: request.id, updated_at: new Date().toISOString() })
    .eq("id", paId)
    .is("document_request_id", null);
  if (linkErr) throw linkErr;

  /* OFF unless PA_AUTO_MARK_RECEIVED=true. pa_received_at is half of the gate on
   * the director ID walkthrough (trainingVideoReleased in app/api/portal/_shared.ts),
   * and until now only a rep set it, after reading the PA. Stamping it from an
   * email match would show a client who already has the video released an
   * instruction to obtain a government identifier with nobody having confirmed
   * the structure, and the first run would back-fill every historical PA. */
  if (process.env.PA_AUTO_MARK_RECEIVED !== "true") return;
  if (request.pa_received_at) return;
  const stamp = { pa_received_at: new Date().toISOString(), pa_received_by: PA_RECEIVED_BY };
  const { error: ownErr } = await supabase
    .from("document_requests")
    .update(stamp)
    .eq("id", request.id)
    .is("pa_received_at", null);
  if (ownErr) throw ownErr;
  if (request.application_id) {
    // One PA covers the whole application, so joint applicants move together.
    const { error: sibErr } = await supabase
      .from("document_requests")
      .update(stamp)
      .eq("application_id", request.application_id)
      .is("pa_received_at", null);
    if (sibErr) throw sibErr;
  }
}

export async function matchPendingPas(): Promise<PaMatchResult> {
  const result: PaMatchResult = { matched: 0, superseded: 0, unmatched: 0 };

  const { data, error } = await supabase
    .from(PRELIMINARY_ASSESSMENTS_TABLE)
    .select("id,yla_ref,received_at,status,contact_id,document_request_id,matched_by,data")
    .neq("status", "Superseded")
    .order("received_at", { ascending: false })
    .limit(1000);
  if (error) {
    if (paTableMissing(error)) return result; // migration not applied yet — nothing to do
    throw error;
  }
  const rows = (data ?? []) as PendingRow[];

  const stale = rowsToSupersede(rows);
  if (stale.length > 0) {
    // Re-states the status condition: a row sent for signing between the read
    // above and this write must not be pulled out from under its signers.
    const { data: done, error: supErr } = await supabase
      .from(PRELIMINARY_ASSESSMENTS_TABLE)
      .update({ status: "Superseded", updated_at: new Date().toISOString() })
      .in("id", stale)
      .in("status", [...SUPERSEDABLE_STATUSES])
      .select("id");
    if (supErr) throw supErr;
    result.superseded = done?.length ?? 0;
  }

  const staleIds = new Set(stale);
  const pending = rows.filter((r) => !r.contact_id && !staleIds.has(r.id));
  const contactCache = new Map<string, ContactCandidate[]>();

  for (const row of pending) {
    const emails = applicantEmails(row.data);
    let matched = false;

    // matched_by set with no contact = a rep deliberately cleared the match.
    // Re-matching it on the next page load would undo their decision.
    if (emails.length > 0 && !row.matched_by) {
      const candidates: ContactCandidate[] = [];
      for (const email of emails) {
        if (!contactCache.has(email)) contactCache.set(email, await contactsByEmail(email));
        candidates.push(...(contactCache.get(email) ?? []));
      }
      const contactId = pickContact(emails, candidates);
      if (contactId) {
        const now = new Date().toISOString();
        const { data: won, error: upErr } = await supabase
          .from(PRELIMINARY_ASSESSMENTS_TABLE)
          .update({ contact_id: contactId, matched_by: AUTO_MATCHED_BY, matched_at: now, updated_at: now })
          .eq("id", row.id)
          .is("contact_id", null)
          .is("matched_by", null)
          .select("id");
        if (upErr) throw upErr;
        matched = (won?.length ?? 0) > 0;
      }
    }

    if (emails.length > 0 && !row.document_request_id) {
      try {
        await linkDocumentRequest(row.id, emails);
      } catch (e) {
        // Secondary to the contact match, and it depends on two older
        // migrations (document portal, pa_received). Report, don't abort.
        log.warn("pa_match.document_request_link_failed", { pa: row.id, message: errMessage(e) });
      }
    }

    if (matched) result.matched += 1;
    else result.unmatched += 1;
  }

  return result;
}
