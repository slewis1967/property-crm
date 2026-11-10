/**
 * Pre-fill bridge (reverse of factFindToNeedsAnalysis): populate a Borrower Fact
 * Find's applicants from an existing NCCP Needs Analysis.
 *
 * In practice the detailed borrower identity is often entered in the Needs
 * Analysis, leaving the Fact Find an empty stub. This lets the advisor pull that
 * identity across in one click instead of re-keying it (and instead of a Fact
 * Find being signed off blank).
 *
 * Narrow + honest, like its forward twin: it only carries the applicant
 * identity, contact, address and CURRENT employment — the fields with a genuine
 * one-to-one counterpart. Assets/liabilities/securities/disclosures are NOT
 * touched (the two documents model them differently); the advisor confirms those
 * on the Fact Find. Every non-obvious decision is surfaced in `notes`. Pure.
 */
import type { Applicant as FactFindApplicant } from "./factfind";
import type { NeedsAnalysisData, Applicant as NaApplicant } from "./needsAnalysis";

function composeAddress(a: { street: string; suburb: string; state: string }): string {
  return [a.street, a.suburb, a.state].map((s) => (s || "").trim()).filter(Boolean).join(", ");
}

/** "DL 6697EE" / "Licence 123" → "6697EE" / "123". Keeps a bare number as-is. */
function licenceNumber(idDocument: string): string {
  return (idDocument || "").replace(/^\s*(dl|driver'?s?\s+licence|licence|passport)\s*[:#-]?\s*/i, "").trim();
}

function naApplicantToFactFind(a: NaApplicant): FactFindApplicant {
  const emp = a.current_employment;
  const contact = a.contact;
  const addr = a.current_address;
  return {
    title: a.title || "",
    family_name: a.surname || "",
    given_names: a.given_names || "",
    capacity: "",
    address: composeAddress(addr),
    postcode: addr.postcode || "",
    phone_work: contact.work_phone || "",
    phone_home: contact.mobile_phone || contact.home_phone || "",
    email: contact.email || "",
    date_of_birth: a.dob || "",
    drivers_licence: licenceNumber(a.additional?.id_document || ""),
    occupation: emp?.occupation || "",
    annual_income: typeof emp?.income_amount === "number" ? emp.income_amount : null,
    has_hecs: false,
    hecs_balance: null,
  };
}

/** True when an NA applicant slot is actually in use (has a name). */
function naApplicantInUse(a: NaApplicant): boolean {
  return !!((a.given_names || "").trim() || (a.surname || "").trim());
}

export function needsAnalysisToFactFind(na: NeedsAnalysisData): {
  applicants: FactFindApplicant[];
  notes: string[];
} {
  const applicants = (na.applicants || []).filter(naApplicantInUse).map(naApplicantToFactFind);
  const notes = [
    "Identity, contact, address and current employment were carried from the Needs Analysis.",
    "HECS/HELP isn't captured in the Needs Analysis — set it on the Fact Find if it applies.",
    "Assets, liabilities, securities and disclosures were not copied — enter or confirm those on the Fact Find.",
  ];
  return { applicants, notes };
}

/**
 * Field-level merge for applying the seed to a Fact Find already on screen: for
 * each applicant, take the Needs-Analysis value where it's non-empty, otherwise
 * keep what the Fact Find already had. Never destroys existing data.
 */
export function mergeSeededApplicant(existing: FactFindApplicant, seeded: FactFindApplicant): FactFindApplicant {
  const out = { ...existing };
  (Object.keys(seeded) as (keyof FactFindApplicant)[]).forEach((k) => {
    const cur = out[k];
    const curEmpty = cur === "" || cur === null || cur === undefined;
    const sv = seeded[k];
    const seededNonEmpty = sv !== "" && sv !== null && sv !== undefined;
    // Fill blanks only — a value already in the Fact Find is never overwritten.
    if (curEmpty && seededNonEmpty) (out as Record<string, unknown>)[k] = sv;
  });
  return out;
}
