/**
 * Pure types + logic for the e-signature flow, shared by the server routes, the
 * print/PDF components and the signing UI. NO server imports (no supabase, no
 * react-dom, no node:crypto) so it stays unit-testable and safe to pull into a
 * "use client" component.
 *
 * A `SignatureMark` is the rendered evidence of one signer: the captured
 * signature image (base64 PNG data URI), the name they signed under, and the
 * date. Print documents accept an array of these indexed by applicant (0-based:
 * signer_index 1 → index 0).
 */

import type { ComplianceDocType } from "./compliance-audit";

/** The three signable compliance documents. Same set as ComplianceDocType. */
export const SIGN_DOC_TYPES: ComplianceDocType[] = [
  "fact_find",
  "needs_analysis",
  "credit_authorisation",
];

export function isSignDocType(v: unknown): v is ComplianceDocType {
  return typeof v === "string" && (SIGN_DOC_TYPES as string[]).includes(v);
}

/** Friendly, customer-facing name for each document (safe to show a signer). */
export const DOC_TYPE_LABEL: Record<ComplianceDocType, string> = {
  fact_find: "Borrower Fact Find",
  needs_analysis: "Needs Analysis",
  credit_authorisation: "Credit File Authorisation",
  // aml_case reuses the compliance audit/lock infra but is NOT part of the
  // e-signature flow (it never appears in SIGN_DOC_TYPES). This entry only
  // satisfies the exhaustive Record; it is never shown to a signer.
  aml_case: "AML/CTF Customer Due Diligence",
};

/** The lifecycle of a single signer's request. */
export const SIGN_STATUSES = ["sent", "viewed", "signed", "declined", "expired"] as const;
export type SignStatus = (typeof SIGN_STATUSES)[number];

/** Human labels for the advisor-side status panel. */
export const SIGN_STATUS_LABEL: Record<SignStatus, string> = {
  sent: "Sent",
  viewed: "Viewed",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
};

/** What a print document needs to render one signer's mark into its signature area. */
export type SignatureMark = {
  /** base64 PNG data URI of the captured signature (or a typed-name fallback). */
  image: string;
  name: string;
  /** ISO or display date the signer completed. */
  date: string;
};

/** A request row as far as the pure status logic is concerned. */
export type SignerLike = {
  signer_index: number;
  status: string;
  signature_image?: string | null;
  signer_name?: string | null;
  signed_at?: string | null;
};

/**
 * True when a request is in a terminal, non-signable state. A GET/POST against a
 * token in one of these states must be refused with a generic message.
 */
export function isTerminalStatus(status: string): boolean {
  return status === "signed" || status === "declined" || status === "expired";
}

/** True when `expires_at` (ISO) is in the past relative to `now` (ms). */
export function isExpired(expiresAt: string | null | undefined, now: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t < now;
}

/**
 * True when every signer request for a document has been signed — the trigger to
 * lock the underlying document and record the `sign` audit. An empty list is not
 * "all signed" (nothing was ever requested).
 */
export function allSigned(rows: SignerLike[]): boolean {
  return rows.length > 0 && rows.every((r) => r.status === "signed");
}

/**
 * Build the per-applicant signatures array a print document renders, from the
 * signed request rows. Index is signer_index-1 (applicant 0/1); unsigned slots
 * are null. Rows without a signature image are skipped. Out-of-range indices are
 * ignored so a malformed row can't crash the render.
 */
export function buildSignaturesArray(rows: SignerLike[]): (SignatureMark | null)[] {
  const out: (SignatureMark | null)[] = [];
  for (const r of rows) {
    if (r.status !== "signed" || !r.signature_image) continue;
    const idx = r.signer_index - 1;
    if (idx < 0 || idx > 8) continue;
    out[idx] = {
      image: r.signature_image,
      name: (r.signer_name ?? "").trim(),
      date: r.signed_at ? formatSignedDate(r.signed_at) : "",
    };
  }
  return out;
}

/** "13 Jul 2026" from an ISO timestamp; passes non-parseable input through. */
export function formatSignedDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
