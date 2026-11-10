/**
 * Pre-fill bridge: seed an AML/CTF CDD case from a Borrower Fact Find.
 *
 * An AML case covers ONE party. A Fact Find's primary borrower (Applicant 1) is
 * mapped to an individual CDD case — legal name, date of birth and residential
 * address — so the officer doesn't re-key what the Fact Find already holds. A
 * second applicant is a separate natural person needing their own CDD case, so
 * this maps only Applicant 1; the officer starts a second case for a co-borrower.
 *
 * The Fact Find keeps a single free-text address line + a separate postcode, so
 * the whole line goes to the residential address `line1` (suburb/state aren't
 * split out on that form).
 *
 * Pure — no I/O, no mutation of the input.
 */

import type { FactFindData } from "./factfind";
import { emptyAmlCase, type AmlCaseData } from "./aml";

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export function factFindToAmlCase(ff: FactFindData): AmlCaseData {
  const data = emptyAmlCase("individual");
  const a = ff.applicants[0];
  if (!a) return data;

  const name = [clean(a.given_names), clean(a.family_name)].filter(Boolean).join(" ");
  if (name) data.entity.fullLegalName = name;
  if (clean(a.date_of_birth)) data.entity.dob = clean(a.date_of_birth);
  if (clean(a.address)) data.entity.residentialAddress.line1 = clean(a.address);
  if (clean(a.postcode)) data.entity.residentialAddress.postcode = clean(a.postcode);

  return data;
}
