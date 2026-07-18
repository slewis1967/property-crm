/**
 * Server-side sync: when a Needs Analysis is COMPLETED, promote the people it
 * captured into first-class CRM contacts, so every other form (Credit File
 * Authorisation, Borrower Fact Find, AML/CTF) can prefill from them.
 *
 * The motivating gap: Applicant 1 is usually picked from Contacts (the NA
 * carries its `contact_id`), but Applicant 2 is keyed by hand and never becomes
 * a contact — so nothing downstream can reuse their name, address or details.
 * On completion we create-or-update a contact for BOTH applicants and, if the
 * NA had no linked contact yet, write Applicant 1's new contact id back onto it.
 *
 * Design rules:
 *  - Best-effort. This runs as a side effect of the completing save; it must
 *    NEVER throw back into the request. A contact that fails to sync is logged,
 *    not surfaced as a save failure — the compliance document is what matters.
 *  - Merge, don't clobber. applicantToContactRecord() only emits fields the
 *    applicant actually filled in, so updating an existing contact fills gaps
 *    (e.g. adds a home address) without blanking data the CRM already holds.
 *  - Dedupe. Match an existing contact by email, then by full name + DOB, before
 *    inserting — so re-completing a reopened NA updates the same contact rather
 *    than spawning duplicates.
 *
 * The pure mapping lives in utils/needsAnalysisToContact.ts; only the I/O
 * (lookup / insert / update / write-back) lives here.
 */

import { supabase } from "./supabase";
import { log, errInfo } from "./logger";
import { hydrateNeedsAnalysis, type NeedsAnalysisData, type Applicant } from "./needsAnalysis";
import {
  applicantHasIdentity,
  applicantToContactRecord,
  type ContactSyncRecord,
} from "./needsAnalysisToContact";

export type ContactSyncResult = {
  app1ContactId: string | null;
  app2ContactId: string | null;
  created: number;
  updated: number;
};

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
    .insert({ ...rec, source: "needs_analysis", status: "new", created_at: now, updated_at: now })
    .select("id")
    .single();
  if (error || !data) {
    log.warn("contact_sync.insert_failed", { ...errInfo(error) });
    return { id: null, action: "skipped" };
  }
  return { id: data.id as string, action: "created" };
}

/**
 * Sync both applicants of a completed Needs Analysis into Contacts.
 *
 * @param naId      the needs-analysis row id
 * @param preloaded optional already-hydrated data + linked contact id, to avoid
 *                  a re-fetch when the caller already has them (the PATCH path
 *                  has the snapshot in hand).
 */
export async function syncNeedsAnalysisContacts(
  naId: string,
  preloaded?: { data: NeedsAnalysisData; contactId: string | null },
): Promise<ContactSyncResult> {
  const result: ContactSyncResult = { app1ContactId: null, app2ContactId: null, created: 0, updated: 0 };
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
        log.warn("contact_sync.load_failed", { naId, ...errInfo(error) });
        return result;
      }
      data = hydrateNeedsAnalysis((row as { data: unknown }).data);
      linkedContactId = (row as { contact_id: string | null }).contact_id ?? null;
    }

    const tally = (action: "created" | "updated" | "skipped") => {
      if (action === "created") result.created += 1;
      else if (action === "updated") result.updated += 1;
    };

    // Applicant 1: reuse the NA's linked contact when present, else dedupe.
    const app1: Applicant = data.applicants[0];
    if (applicantHasIdentity(app1)) {
      const rec = applicantToContactRecord(app1);
      const existing = linkedContactId ?? (await findExistingContactId(rec));
      const { id, action } = await upsertContact(rec, existing);
      result.app1ContactId = id;
      tally(action);
      // Backfill the NA's contact link if it didn't have one and we made/found it.
      if (!linkedContactId && id) {
        const { error } = await supabase.from("nccp_needs_analyses").update({ contact_id: id }).eq("id", naId);
        if (error) log.warn("contact_sync.link_backfill_failed", { naId, contactId: id, ...errInfo(error) });
        else linkedContactId = id;
      }
    }

    // Applicant 2: never a linked contact — dedupe then upsert. If they resolve
    // to Applicant 1's contact (e.g. a couple sharing one email), don't
    // double-write it as the other person.
    const app2: Applicant = data.applicants[1];
    if (applicantHasIdentity(app2)) {
      const rec = applicantToContactRecord(app2);
      const existing = await findExistingContactId(rec);
      if (existing && existing === result.app1ContactId) {
        result.app2ContactId = existing;
      } else {
        const { id, action } = await upsertContact(rec, existing);
        result.app2ContactId = id;
        tally(action);
      }
    }

    log.info("contact_sync.done", {
      naId,
      app1: result.app1ContactId,
      app2: result.app2ContactId,
      created: result.created,
      updated: result.updated,
    });
    return result;
  } catch (e) {
    // Absolute backstop — a sync error must never fail the completing save.
    log.error("contact_sync.failed", { naId, ...errInfo(e) });
    return result;
  }
}
