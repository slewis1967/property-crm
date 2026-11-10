/**
 * Extract-to-contact bridge for the Borrower Fact Find — the Fact Find analogue
 * of utils/needsAnalysisToContact.ts. Turns one Fact Find applicant into a CRM
 * contact record, so a person captured on the form (typically the SECOND
 * applicant, keyed by hand and never picked from Contacts) becomes a first-class
 * contact the rest of the CRM can prefill from.
 *
 * Emits only the columns the applicant actually populated (a *partial* record),
 * so merging it over an existing contact never blanks held data. Pure — the
 * upsert/dedupe I/O lives in utils/contact-sync.ts.
 *
 * Shape differences from the Needs Analysis mapper:
 *  - The Fact Find keeps a single free-text `address` line + a separate
 *    `postcode` (no suburb/state split), so the whole line goes to
 *    `home_address_street` and the postcode to `home_address_postcode`.
 *  - Phones are `phone_home` / `phone_work` (no mobile field); home wins.
 *  - `annual_income` is already an annual figure (no pay-frequency to scale).
 *  - HECS/HELP balance is captured (the Needs Analysis has no field for it).
 */

import type { Applicant } from "./factfind";
import type { ContactSyncRecord } from "./needsAnalysisToContact";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** True when the applicant has at least a name — nothing to sync otherwise. */
export function factFindApplicantHasIdentity(a: Applicant): boolean {
  return Boolean(clean(a.family_name) || clean(a.given_names));
}

/**
 * Map one Borrower Fact Find applicant onto a partial contact record. Returns
 * only the columns the applicant populated.
 */
export function factFindApplicantToContactRecord(a: Applicant): ContactSyncRecord {
  const rec: ContactSyncRecord = {};

  const given = clean(a.given_names);
  const family = clean(a.family_name);
  const fullName = [given, family].filter(Boolean).join(" ");
  if (fullName) {
    rec.full_name = fullName;
    rec.name = fullName;
  }
  if (given) rec.first_name = given;

  const email = clean(a.email).toLowerCase();
  if (email) rec.email = email;

  // The Fact Find has no mobile field; prefer home, then work.
  const phone = clean(a.phone_home) || clean(a.phone_work);
  if (phone) rec.phone = phone;

  if (clean(a.date_of_birth)) rec.date_of_birth = clean(a.date_of_birth);

  // Single free-text address line + separate postcode (no suburb/state split).
  if (clean(a.address)) rec.home_address_street = clean(a.address);
  if (clean(a.postcode)) rec.home_address_postcode = clean(a.postcode);

  if (clean(a.occupation)) rec.occupation = clean(a.occupation);
  // Already an annual figure on this form — no frequency to scale.
  if (typeof a.annual_income === "number") rec.annual_income = a.annual_income;
  if (typeof a.hecs_balance === "number") rec.hecs_balance = a.hecs_balance;

  return rec;
}
