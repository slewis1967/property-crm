/**
 * Pre-fill bridge: seed a Credit File Authorisation (the Equifax Access Seeker
 * consent) from a Borrower Fact Find. The Fact Find analogue of
 * utils/needsAnalysisToCreditAuth.ts.
 *
 * The Credit Authorisation is almost entirely fixed legal text; the applicant
 * only fills in the "I ___ (Name/s)" and "of ___ (Address)" lines. Both come
 * straight off the Fact Find:
 *   - names   = both applicants, "Given Surname & Given Surname"
 *   - address = Applicant 1's home address (the Fact Find keeps a single
 *               free-text address line + a separate postcode)
 *
 * Pure — no I/O, no mutation of the input.
 */

import type { FactFindData, Applicant } from "./factfind";
import { emptyCreditAuthorisation, type CreditAuthorisationData } from "./creditAuthorisation";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "Given Surname" for one applicant, or "" when unnamed. */
function applicantName(a: Applicant): string {
  return [clean(a.given_names), clean(a.family_name)].filter(Boolean).join(" ");
}

/** "12 Smith St, Toowong QLD, 4066" — the free-text line plus the postcode. */
function homeAddressLine(a: Applicant): string {
  return [clean(a.address), clean(a.postcode)].filter(Boolean).join(", ");
}

export function factFindToCreditAuth(ff: FactFindData): CreditAuthorisationData {
  const data = emptyCreditAuthorisation();

  data.names = ff.applicants.map(applicantName).filter(Boolean).join(" & ");
  // The consent form has a single address line; use Applicant 1's home address
  // (fall back to Applicant 2's if the first has none).
  data.address = homeAddressLine(ff.applicants[0]) || homeAddressLine(ff.applicants[1]);
  // Per-applicant signers (name + email) so the send-for-signature modal opens
  // ready to send to both applicants.
  data.signers = ff.applicants
    .map((a) => ({ name: applicantName(a), email: clean(a.email) }))
    .filter((s) => s.name || s.email);

  return data;
}
