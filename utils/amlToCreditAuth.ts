/**
 * Pre-fill bridge: seed a Credit File Authorisation (the Equifax Access Seeker
 * consent) from an AML/CTF CDD case. The AML analogue of
 * utils/needsAnalysisToCreditAuth.ts and utils/factFindToCreditAuth.ts.
 *
 * The Credit Authorisation is almost entirely fixed legal text; only the
 * "I ___ (Name/s)" and "of ___ (Address)" lines are filled in. From an AML case:
 *   - names   = every natural person the case identifies — the acting individual
 *               plus each 25%+ beneficial owner — joined "A & B & C" (deduped).
 *   - address = the acting individual's residential address (the case's single
 *               residential address; the form has one "of" line).
 *
 * The result opens as an editable draft, so a broker can adjust who is named.
 * Pure — no I/O, no mutation of the input.
 */

import type { AmlCaseData } from "./aml";
import { emptyCreditAuthorisation, type CreditAuthorisationData } from "./creditAuthorisation";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** "12 Smith St, Toowong, QLD, 4066" from the acting individual's address. */
function residentialLine(data: AmlCaseData): string {
  const a = data.entity?.residentialAddress;
  if (!a) return "";
  return [a.line1, a.suburb, a.state, a.postcode].map(clean).filter(Boolean).join(", ");
}

export function amlToCreditAuth(data: AmlCaseData): CreditAuthorisationData {
  const ca = emptyCreditAuthorisation();

  const names = [
    clean(data.entity?.fullLegalName),
    ...(data.beneficialOwners ?? []).map((bo) => clean(bo.fullLegalName)),
  ].filter(Boolean);
  const unique = [...new Set(names)];
  ca.names = unique.join(" & ");
  ca.address = residentialLine(data);
  // Signers for the send-for-signature modal. The AML case captures no email for
  // the acting individual or owners, so names are pre-filled and the sender adds
  // the emails before sending.
  ca.signers = unique.map((name) => ({ name, email: "" }));

  return ca;
}
