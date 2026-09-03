/**
 * Reading an applicant out of a Fact Find / Needs Analysis `applicants[]` blob.
 *
 * The two forms store the same person in different shapes, so every read here
 * is deliberately tolerant of both:
 *
 *            name parts                        email
 *   FF       given_names + family_name         email            (top level)
 *   NA       given_names + surname             contact.email    (nested)
 *
 * Getting the email wrong is not cosmetic: /api/document-requests/prefill feeds
 * the "Request documents" popover, and a missing address means applicant 2 never
 * receives their secure upload link — the rep has to notice and retype it.
 */

export type Applicant = Record<string, unknown>;

/** Join the name parts a form uses. Tolerant of either shape. */
export function applicantName(a: Applicant | undefined): string {
  if (!a || typeof a !== "object") return "";
  const given = String(a.given_names ?? a.first_name ?? "").trim();
  const family = String(a.family_name ?? a.surname ?? a.last_name ?? "").trim();
  return `${given} ${family}`.trim();
}

/** Top-level `email` (Fact Find) falling back to nested `contact.email` (NA). */
export function applicantEmail(a: Applicant | undefined): string {
  if (!a || typeof a !== "object") return "";
  const direct = String(a.email ?? "").trim();
  if (direct) return direct;
  const contact = a.contact;
  if (contact && typeof contact === "object") {
    return String((contact as Record<string, unknown>).email ?? "").trim();
  }
  return "";
}
