/**
 * Extract-to-contact bridge: turn one NCCP Needs Analysis applicant into a CRM
 * contact record, so a person captured on the form (typically the SECOND
 * applicant, who was keyed by hand and never picked from Contacts) becomes a
 * first-class contact the rest of the CRM can prefill from — Credit File
 * Authorisation, Borrower Fact Find, AML/CTF, etc.
 *
 * This is the inverse of utils/factfind.ts `contactToApplicant`: there a contact
 * seeds an applicant; here a completed applicant seeds/enriches a contact.
 *
 * The mapping is deliberately NARROW and CONSERVATIVE — it only emits a column
 * when the Needs Analysis genuinely carries that value, and every column it
 * emits is one a downstream form already reads (name, email, phone, DOB,
 * marital status, dependents, home address, occupation, annual income). The
 * result is a *partial* record: fields the applicant left blank are OMITTED, not
 * written as empty strings, so merging it over an existing contact never blanks
 * out data the CRM already holds.
 *
 * Pure — no I/O, no mutation of the input. The sync/upsert I/O lives in
 * utils/contact-sync.ts.
 */

import type { Applicant } from "./needsAnalysis";

/**
 * The subset of `contacts` columns this bridge writes. Every key here is on the
 * PATCH allow-list in app/api/contacts/[id]/route.ts and is read by at least one
 * downstream prefill (see utils/factfind.ts `contactToApplicant`,
 * app/api/credit-authorisations/route.ts `prefillFromContact`).
 */
export type ContactSyncRecord = {
  full_name?: string;
  name?: string;
  first_name?: string;
  email?: string;
  phone?: string;
  date_of_birth?: string;
  marital_status?: string;
  dependents_count?: number;
  home_address_street?: string;
  home_address_suburb?: string;
  home_address_state?: string;
  home_address_postcode?: string;
  occupation?: string;
  annual_income?: number;
  hecs_balance?: number;
};

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Annualise a pay figure. `pa` (per annum) is already annual; wk/fn/m scale up. */
const PAY_MULTIPLIER: Record<string, number> = { wk: 52, fn: 26, m: 12, pa: 1 };
function annualise(amount: number | null | undefined, frequency: string): number | null {
  if (typeof amount !== "number" || !isFinite(amount)) return null;
  const mult = PAY_MULTIPLIER[frequency] ?? 1;
  return Math.round(amount * mult);
}

/** True when the applicant has at least a name — nothing to sync otherwise. */
export function applicantHasIdentity(a: Applicant): boolean {
  return Boolean(clean(a.surname) || clean(a.given_names));
}

/**
 * Map one Needs Analysis applicant onto a partial contact record. Returns only
 * the columns the applicant actually populated — callers merge this over an
 * existing contact (or insert it) without fear of blanking existing data.
 */
export function applicantToContactRecord(a: Applicant): ContactSyncRecord {
  const rec: ContactSyncRecord = {};

  const given = clean(a.given_names);
  const surname = clean(a.surname);
  const fullName = [given, surname].filter(Boolean).join(" ");
  if (fullName) {
    rec.full_name = fullName;
    rec.name = fullName;
  }
  if (given) rec.first_name = given;

  const email = clean(a.contact?.email).toLowerCase();
  if (email) rec.email = email;

  // The contact carries a single phone; prefer mobile, then home, then work.
  const phone = clean(a.contact?.mobile_phone) || clean(a.contact?.home_phone) || clean(a.contact?.work_phone);
  if (phone) rec.phone = phone;

  if (clean(a.dob)) rec.date_of_birth = clean(a.dob);
  if (clean(a.marital_status)) rec.marital_status = clean(a.marital_status);
  if (typeof a.dependents_count === "number") rec.dependents_count = a.dependents_count;

  const addr = a.current_address;
  if (addr) {
    if (clean(addr.street)) rec.home_address_street = clean(addr.street);
    if (clean(addr.suburb)) rec.home_address_suburb = clean(addr.suburb);
    if (clean(addr.state)) rec.home_address_state = clean(addr.state);
    if (clean(addr.postcode)) rec.home_address_postcode = clean(addr.postcode);
  }

  const emp = a.current_employment;
  if (emp) {
    if (clean(emp.occupation)) rec.occupation = clean(emp.occupation);
    // Income is stored per-frequency on the form; contacts hold a plain annual
    // figure, so annualise. Gross-vs-net isn't distinguished on the contact.
    const annual = annualise(emp.income_amount, emp.pay_frequency);
    if (annual != null) rec.annual_income = annual;
  }

  return rec;
}
