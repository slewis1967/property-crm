/**
 * Pre-fill bridge: seed a Credit File Authorisation (the Equifax Access Seeker
 * consent) from a completed NCCP Needs Analysis.
 *
 * The Credit Authorisation is almost entirely fixed legal text; the applicant
 * only fills in the "I ___ (Name/s)" and "of ___ (Address)" lines. Both come
 * straight off the Needs Analysis:
 *   - names   = both applicants, "Given Surname & Given Surname"
 *   - address = Applicant 1's current residential address
 *
 * Pure — no I/O, no mutation of the input. Mirrors the single-contact prefill in
 * app/api/credit-authorisations/route.ts, but carries BOTH applicants' names and
 * pulls the address from the Needs Analysis rather than a lone contact record.
 */

import type { NeedsAnalysisData, Applicant } from "./needsAnalysis";
import { emptyCreditAuthorisation, type CreditAuthorisationData } from "./creditAuthorisation";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "Given Surname" for one applicant, or "" when unnamed. */
function applicantName(a: Applicant): string {
  return [clean(a.given_names), clean(a.surname)].filter(Boolean).join(" ");
}

/** "12 Smith St, Toowong, QLD, 4066" — matches the contact prefill's join. */
function currentAddressLine(a: Applicant): string {
  const addr = a.current_address;
  if (!addr) return "";
  return [addr.street, addr.suburb, addr.state, addr.postcode].map(clean).filter(Boolean).join(", ");
}

export function needsAnalysisToCreditAuth(na: NeedsAnalysisData): CreditAuthorisationData {
  const data = emptyCreditAuthorisation();

  data.names = na.applicants.map(applicantName).filter(Boolean).join(" & ");
  // The consent form has a single address line; use Applicant 1's current
  // address (fall back to Applicant 2's if the first has none).
  data.address = currentAddressLine(na.applicants[0]) || currentAddressLine(na.applicants[1]);

  return data;
}
