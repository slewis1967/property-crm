/**
 * Extract-to-contact bridge for an AML/CTF CDD case — the AML analogue of
 * utils/needsAnalysisToContact.ts and utils/factFindToContact.ts.
 *
 * Unlike those two, an AML case is not two applicants. It captures ONE party
 * (an acting individual — for an entity case, the authorised person acting for
 * it) plus zero or more 25%+ beneficial owners. On completion each natural
 * person the case identifies becomes a contact:
 *  - the acting individual carries a residential address (mapped to the contact
 *    home address), so downstream forms get the address, as with NA/Fact Find;
 *  - beneficial owners carry only a legal name + DOB (the KYC minimum), so their
 *    contact records are name/DOB only.
 *
 * Emits only the columns the case actually populated (a *partial* record), so a
 * merge over an existing contact never blanks held data. Pure — the upsert/
 * dedupe I/O lives in utils/contact-sync.ts.
 */

import type { AmlCaseData, BeneficialOwner } from "./aml";
import type { ContactSyncRecord } from "./needsAnalysisToContact";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * The acting individual on the case (the person, for an individual party; the
 * authorised individual acting for a company/trust/SMSF otherwise), mapped to a
 * contact record with their residential address.
 */
export function amlPartyToContactRecord(data: AmlCaseData): ContactSyncRecord {
  const rec: ContactSyncRecord = {};
  const e = data.entity;
  if (!e) return rec;

  const name = clean(e.fullLegalName);
  if (name) {
    rec.full_name = name;
    rec.name = name;
  }
  if (clean(e.dob)) rec.date_of_birth = clean(e.dob);

  const addr = e.residentialAddress;
  if (addr) {
    if (clean(addr.line1)) rec.home_address_street = clean(addr.line1);
    if (clean(addr.suburb)) rec.home_address_suburb = clean(addr.suburb);
    if (clean(addr.state)) rec.home_address_state = clean(addr.state);
    if (clean(addr.postcode)) rec.home_address_postcode = clean(addr.postcode);
  }

  return rec;
}

/** One 25%+ beneficial owner → a name/DOB-only contact record. */
export function beneficialOwnerToContactRecord(bo: BeneficialOwner): ContactSyncRecord {
  const rec: ContactSyncRecord = {};
  const name = clean(bo.fullLegalName);
  if (name) {
    rec.full_name = name;
    rec.name = name;
  }
  if (clean(bo.dob)) rec.date_of_birth = clean(bo.dob);
  return rec;
}
