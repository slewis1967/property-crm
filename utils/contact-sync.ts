/**
 * Server-side sync: when a compliance document (Needs Analysis, Borrower Fact
 * Find, or AML/CTF CDD case) is COMPLETED, promote the natural persons it
 * captured into first-class CRM contacts, so every other form can prefill from
 * them.
 *
 * The motivating gap: the primary party is usually picked from Contacts (the
 * document carries its `contact_id`), but the other people on the form (a second
 * applicant, or an AML beneficial owner) are keyed by hand and never become
 * contacts — so nothing downstream can reuse their name, address or details. On
 * completion we create-or-update a contact for EVERY person and, if the document
 * had no linked contact yet, write the primary person's contact id back onto it.
 *
 * Each document shape maps to a `primary` person + a list of `others`:
 *  - Needs Analysis / Fact Find → Applicant 1 (primary) + Applicant 2 (other).
 *  - AML case → the acting individual (primary) + each beneficial owner (other).
 *
 * Design rules:
 *  - Best-effort. This runs as a side effect of the completing save; it must
 *    NEVER throw back into the request. A person that fails to sync is logged,
 *    not surfaced as a save failure — the compliance document is what matters.
 *  - Merge, don't clobber. The per-doc mapper only emits fields the form filled
 *    in, so updating an existing contact fills gaps without blanking held data.
 *  - Dedupe. Match an existing contact by email, then by full name + DOB, before
 *    inserting — so re-completing a reopened document updates the same contact
 *    rather than spawning duplicates, and a person listed twice (e.g. the party
 *    who is also a beneficial owner) is written once.
 *
 * The pure per-doc mappers live in utils/needsAnalysisToContact.ts,
 * utils/factFindToContact.ts and utils/amlToContact.ts; only the I/O (lookup /
 * insert / update / write-back) and the shared orchestration live here.
 */

import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import { hydrateNeedsAnalysis, type NeedsAnalysisData } from "./needsAnalysis";
import { hydrateFactFind } from "./factfind";
import { hydrateAmlCase } from "./aml";
import { applicantToContactRecord, type ContactSyncRecord } from "./needsAnalysisToContact";
import { factFindApplicantToContactRecord } from "./factFindToContact";
import { amlPartyToContactRecord, beneficialOwnerToContactRecord } from "./amlToContact";

export type ContactSyncResult = {
  primaryContactId: string | null;
  otherContactIds: string[];
  created: number;
  updated: number;
};

const emptyResult = (): ContactSyncResult => ({ primaryContactId: null, otherContactIds: [], created: 0, updated: 0 });

/** A record with at least a name is worth syncing. */
const hasName = (rec: ContactSyncRecord | null | undefined): rec is ContactSyncRecord => Boolean(rec?.full_name);

/** Find an existing contact for a mapped person. Email first, then name+DOB. */
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
 * Shared orchestration: sync a document's `primary` person (which backfills the
 * document's `contact_id` when it has none) plus a list of `others`. A person
 * that resolves to an already-synced contact this run is recorded but not
 * written twice.
 */
async function syncContactRecords(opts: {
  table: string;
  docId: string;
  docLabel: string;
  /** `contacts.source` written on a freshly-inserted contact. */
  source: string;
  linkedContactId: string | null;
  primary: ContactSyncRecord | null;
  others: (ContactSyncRecord | null)[];
}): Promise<ContactSyncResult> {
  const { table, docId, docLabel, source, primary, others } = opts;
  const result = emptyResult();
  let linkedContactId = opts.linkedContactId;
  const seen = new Set<string>();

  const tally = (action: "created" | "updated" | "skipped") => {
    if (action === "created") result.created += 1;
    else if (action === "updated") result.updated += 1;
  };

  // Primary: reuse the document's linked contact when present, else dedupe.
  if (hasName(primary)) {
    const existing = linkedContactId ?? (await findExistingContactId(primary));
    const { id, action } = await upsertContact(primary, existing, source);
    result.primaryContactId = id;
    tally(action);
    if (id) seen.add(id);
    // Backfill the document's contact link if it didn't have one and we made/found it.
    if (!linkedContactId && id) {
      const { error } = await supabase.from(table).update({ contact_id: id }).eq("id", docId);
      if (error) log.warn("contact_sync.link_backfill_failed", { docLabel, docId, contactId: id, ...errInfo(error) });
      else linkedContactId = id;
    }
  }

  // Others: each is deduped and upserted. Skip a re-write when a person resolves
  // to a contact already synced this run (e.g. the party is also a beneficial
  // owner, or a name is listed twice).
  for (const rec of others) {
    if (!hasName(rec)) continue;
    const existing = await findExistingContactId(rec);
    if (existing && seen.has(existing)) {
      result.otherContactIds.push(existing);
      continue;
    }
    const { id, action } = await upsertContact(rec, existing, source);
    if (id) {
      seen.add(id);
      result.otherContactIds.push(id);
    }
    tally(action);
  }

  log.info("contact_sync.done", {
    docLabel,
    docId,
    primary: result.primaryContactId,
    others: result.otherContactIds,
    created: result.created,
    updated: result.updated,
  });
  return result;
}

/**
 * Sync a completed Needs Analysis's two applicants into Contacts.
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

    return await syncContactRecords({
      table: "nccp_needs_analyses",
      docId: naId,
      docLabel: "needs_analysis",
      source: "needs_analysis",
      linkedContactId,
      primary: applicantToContactRecord(data.applicants[0]),
      others: [applicantToContactRecord(data.applicants[1])],
    });
  } catch (e) {
    // Absolute backstop — a sync error must never fail the completing save.
    log.error("contact_sync.failed", { docLabel: "needs_analysis", docId: naId, ...errInfo(e) });
    return emptyResult();
  }
}

/**
 * Sync a completed Borrower Fact Find's two applicants into Contacts. Same shape
 * as the Needs Analysis path, over `borrower_fact_finds`.
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

    return await syncContactRecords({
      table: "borrower_fact_finds",
      docId: ffId,
      docLabel: "fact_find",
      source: "fact_find",
      linkedContactId,
      primary: factFindApplicantToContactRecord(data.applicants[0]),
      others: [factFindApplicantToContactRecord(data.applicants[1])],
    });
  } catch (e) {
    log.error("contact_sync.failed", { docLabel: "fact_find", docId: ffId, ...errInfo(e) });
    return emptyResult();
  }
}

/**
 * Sync a completed ("Cleared") AML/CTF CDD case's people into Contacts: the
 * acting individual (primary, with residential address) plus each 25%+
 * beneficial owner (name + DOB).
 */
export async function syncAmlCaseContacts(caseId: string): Promise<ContactSyncResult> {
  try {
    const { data: row, error } = await supabase
      .from("aml_cases")
      .select("data,contact_id")
      .eq("id", caseId)
      .maybeSingle();
    if (error || !row) {
      log.warn("contact_sync.load_failed", { docLabel: "aml_case", docId: caseId, ...errInfo(error) });
      return emptyResult();
    }
    const data = hydrateAmlCase((row as { data: unknown }).data);
    const linkedContactId = (row as { contact_id: string | null }).contact_id ?? null;

    return await syncContactRecords({
      table: "aml_cases",
      docId: caseId,
      docLabel: "aml_case",
      source: "aml_case",
      linkedContactId,
      primary: amlPartyToContactRecord(data),
      others: (data.beneficialOwners ?? []).map(beneficialOwnerToContactRecord),
    });
  } catch (e) {
    log.error("contact_sync.failed", { docLabel: "aml_case", docId: caseId, ...errInfo(e) });
    return emptyResult();
  }
}
