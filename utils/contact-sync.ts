/**
 * Server-side sync: when a compliance document (Needs Analysis or Borrower Fact
 * Find) is COMPLETED, promote the people it captured into first-class CRM
 * contacts, so every other form (Credit File Authorisation, the other of
 * NA/Fact Find, AML/CTF) can prefill from them.
 *
 * The motivating gap: Applicant 1 is usually picked from Contacts (the document
 * carries its `contact_id`), but Applicant 2 is keyed by hand and never becomes
 * a contact — so nothing downstream can reuse their name, address or details.
 * On completion we create-or-update a contact for BOTH applicants and, if the
 * document had no linked contact yet, write Applicant 1's new contact id back.
 *
 * Design rules:
 *  - Best-effort. This runs as a side effect of the completing save; it must
 *    NEVER throw back into the request. A contact that fails to sync is logged,
 *    not surfaced as a save failure — the compliance document is what matters.
 *  - Merge, don't clobber. The per-doc mapper only emits fields the applicant
 *    actually filled in, so updating an existing contact fills gaps (e.g. adds a
 *    home address) without blanking data the CRM already holds.
 *  - Dedupe. Match an existing contact by email, then by full name + DOB, before
 *    inserting — so re-completing a reopened document updates the same contact
 *    rather than spawning duplicates.
 *
 * The pure per-doc mappers live in utils/needsAnalysisToContact.ts and
 * utils/factFindToContact.ts; only the I/O (lookup / insert / update / write-
 * back) and the shared two-applicant orchestration live here.
 */

import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import { hydrateNeedsAnalysis, type NeedsAnalysisData } from "./needsAnalysis";
import { hydrateFactFind } from "./factfind";
import { applicantToContactRecord, type ContactSyncRecord } from "./needsAnalysisToContact";
import { factFindApplicantToContactRecord } from "./factFindToContact";

export type ContactSyncResult = {
  app1ContactId: string | null;
  app2ContactId: string | null;
  created: number;
  updated: number;
};

const emptyResult = (): ContactSyncResult => ({ app1ContactId: null, app2ContactId: null, created: 0, updated: 0 });

/** A record with at least a name is worth syncing. */
const hasName = (rec: ContactSyncRecord | null | undefined): rec is ContactSyncRecord => Boolean(rec?.full_name);

/** Find an existing contact for a mapped applicant. Email first, then name+DOB. */
async function findExistingContactId(rec: ContactSyncRecord): Promise<string | null> {
  if (rec.email) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", rec.email)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }
  // Name alone is too weak (common names); require a matching DOB as well.
  if (rec.full_name && rec.date_of_birth) {
    const { data } = await supabase
      .from("contacts")
      .select("id")
      .eq("full_name", rec.full_name)
      .eq("date_of_birth", rec.date_of_birth)
      .limit(1);
    if (data && data[0]?.id) return data[0].id as string;
  }
  return null;
}

/** Update an existing contact (merge) or insert a new one. Returns its id. */
async function upsertContact(
  rec: ContactSyncRecord,
  existingId: string | null,
  source: string,
): Promise<{ id: string | null; action: "created" | "updated" | "skipped" }> {
  const now = new Date().toISOString();

  if (existingId) {
    const { error } = await supabase
      .from("contacts")
      .update({ ...rec, updated_at: now })
      .eq("id", existingId);
    if (error) {
      log.warn("contact_sync.update_failed", { contactId: existingId, ...errInfo(error) });
      return { id: existingId, action: "skipped" };
    }
    return { id: existingId, action: "updated" };
  }

  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...rec, source, status: "new", created_at: now, updated_at: now })
    .select("id")
    .single();
  if (error || !data) {
    log.warn("contact_sync.insert_failed", { ...errInfo(error) });
    return { id: null, action: "skipped" };
  }
  return { id: data.id as string, action: "created" };
}

/**
 * Shared orchestration for a two-applicant document. Upserts each applicant's
 * mapped record, dedupes, and backfills the document's `contact_id` from
 * Applicant 1 when it had no link yet.
 */
async function syncApplicantRecords(opts: {
  table: string;
  docId: string;
  docLabel: string;
  /** `contacts.source` written on a freshly-inserted contact. */
  source: string;
  linkedContactId: string | null;
  records: [ContactSyncRecord | null, ContactSyncRecord | null];
}): Promise<ContactSyncResult> {
  const { table, docId, docLabel, source, records } = opts;
  const result = emptyResult();
  let linkedContactId = opts.linkedContactId;

  const tally = (action: "created" | "updated" | "skipped") => {
    if (action === "created") result.created += 1;
    else if (action === "updated") result.updated += 1;
  };

  // Applicant 1: reuse the document's linked contact when present, else dedupe.
  const rec1 = records[0];
  if (hasName(rec1)) {
    const existing = linkedContactId ?? (await findExistingContactId(rec1));
    const { id, action } = await upsertContact(rec1, existing, source);
    result.app1ContactId = id;
    tally(action);
    // Backfill the document's contact link if it didn't have one and we made/found it.
    if (!linkedContactId && id) {
      const { error } = await supabase.from(table).update({ contact_id: id }).eq("id", docId);
      if (error) log.warn("contact_sync.link_backfill_failed", { docLabel, docId, contactId: id, ...errInfo(error) });
      else linkedContactId = id;
    }
  }

  // Applicant 2: never a linked contact — dedupe then upsert. If they resolve to
  // Applicant 1's contact (e.g. a couple sharing one email), don't double-write
  // it as the other person.
  const rec2 = records[1];
  if (hasName(rec2)) {
    const existing = await findExistingContactId(rec2);
    if (existing && existing === result.app1ContactId) {
      result.app2ContactId = existing;
    } else {
      const { id, action } = await upsertContact(rec2, existing, source);
      result.app2ContactId = id;
      tally(action);
    }
  }

  log.info("contact_sync.done", {
    docLabel,
    docId,
    app1: result.app1ContactId,
    app2: result.app2ContactId,
    created: result.created,
    updated: result.updated,
  });
  return result;
}

/**
 * Sync both applicants of a completed Needs Analysis into Contacts.
 *
 * @param naId      the needs-analysis row id
 * @param preloaded optional already-hydrated data + linked contact id, to avoid
 *                  a re-fetch when the caller already has them.
 */
export async function syncNeedsAnalysisContacts(
  naId: string,
  preloaded?: { data: NeedsAnalysisData; contactId: string | null },
): Promise<ContactSyncResult> {
  try {
    let data: NeedsAnalysisData;
    let linkedContactId: string | null;

    if (preloaded) {
      data = preloaded.data;
      linkedContactId = preloaded.contactId;
    } else {
      const { data: row, error } = await supabase
        .from("nccp_needs_analyses")
        .select("data,contact_id")
        .eq("id", naId)
        .maybeSingle();
      if (error || !row) {
        log.warn("contact_sync.load_failed", { docLabel: "needs_analysis", docId: naId, ...errInfo(error) });
        return emptyResult();
      }
      data = hydrateNeedsAnalysis((row as { data: unknown }).data);
      linkedContactId = (row as { contact_id: string | null }).contact_id ?? null;
    }

    return await syncApplicantRecords({
      table: "nccp_needs_analyses",
      docId: naId,
      docLabel: "needs_analysis",
      source: "needs_analysis",
      linkedContactId,
      records: [applicantToContactRecord(data.applicants[0]), applicantToContactRecord(data.applicants[1])],
    });
  } catch (e) {
    // Absolute backstop — a sync error must never fail the completing save.
    log.error("contact_sync.failed", { docLabel: "needs_analysis", docId: naId, ...errInfo(e) });
    return emptyResult();
  }
}

/**
 * Sync both applicants of a completed Borrower Fact Find into Contacts. Same
 * shape as the Needs Analysis path, over the `borrower_fact_finds` table with
 * the Fact Find's own applicant→contact mapping.
 */
export async function syncFactFindContacts(ffId: string): Promise<ContactSyncResult> {
  try {
    const { data: row, error } = await supabase
      .from("borrower_fact_finds")
      .select("data,contact_id")
      .eq("id", ffId)
      .maybeSingle();
    if (error || !row) {
      log.warn("contact_sync.load_failed", { docLabel: "fact_find", docId: ffId, ...errInfo(error) });
      return emptyResult();
    }
    const data = hydrateFactFind((row as { data: unknown }).data);
    const linkedContactId = (row as { contact_id: string | null }).contact_id ?? null;

    return await syncApplicantRecords({
      table: "borrower_fact_finds",
      docId: ffId,
      docLabel: "fact_find",
      source: "fact_find",
      linkedContactId,
      records: [
        factFindApplicantToContactRecord(data.applicants[0]),
        factFindApplicantToContactRecord(data.applicants[1]),
      ],
    });
  } catch (e) {
    log.error("contact_sync.failed", { docLabel: "fact_find", docId: ffId, ...errInfo(e) });
    return emptyResult();
  }
}
