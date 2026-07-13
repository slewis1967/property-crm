/**
 * SERVER-ONLY shared plumbing for the `signature_requests` table: the table
 * name, the migration hint, the "table not created yet" detector (same narrow
 * shape as the compliance doc utils), and the PII-safe column projections used
 * by the list / lookup routes.
 */

import { supabase } from "./supabase";
import { hashToken } from "./sign-token";
import type { ComplianceDocType } from "./compliance-audit";

export const SIGNATURE_REQUESTS_TABLE = "signature_requests";

export const SIGNATURE_MIGRATION_HINT =
  "E-signature storage isn't set up yet — run migrations/20260713_signature_requests.sql in the Supabase SQL editor.";

/**
 * True when the failure is just "table not created yet" (migration not run).
 * Narrow: a missing *column* (PGRST204 / 42703) is a schema mismatch, not an
 * unmigrated table, so those are excluded.
 */
export function signatureTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}

/**
 * Columns safe to return to the advisor status panel: NEVER token_hash, NEVER
 * signature_image, NEVER the signer's IP / user-agent evidence.
 */
export const LIST_COLUMNS =
  "id,doc_type,doc_id,signer_index,signer_name,signer_email,status,created_at,sent_at,viewed_at,signed_at,expires_at,signed_pdf_path,decline_reason";

/** A signature request row as returned to the advisor status panel. */
export type SignatureRequestListItem = {
  id: string;
  doc_type: string;
  doc_id: string;
  signer_index: number;
  signer_name: string | null;
  signer_email: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  signed_pdf_path: string | null;
  decline_reason: string | null;
};

/** RFC-lite email check — good enough to reject obvious garbage before we send. */
export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/** Loose UUID v4-ish check for a doc_id path/body value. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/** The full internal shape of a signature_requests row (server-side only). */
export type SignatureRequestRow = {
  id: string;
  doc_type: ComplianceDocType;
  doc_id: string;
  signer_index: number;
  signer_name: string | null;
  signer_email: string;
  status: string;
  created_by: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  expires_at: string | null;
  signature_image: string | null;
  consent_at: string | null;
  signed_pdf_path: string | null;
  decline_reason: string | null;
};

const ROW_COLUMNS =
  "id,doc_type,doc_id,signer_index,signer_name,signer_email,status,created_by,sent_at,viewed_at,signed_at,expires_at,signature_image,consent_at,signed_pdf_path,decline_reason";

/**
 * Look up a signature request by its RAW token (which we hash before querying —
 * the DB only ever holds the hash). Returns { ok:true, row } on a hit,
 * { ok:false, tableMissing } otherwise. A miss and a wrong token are
 * indistinguishable to the caller by design (no info leak).
 */
export async function findRequestByToken(
  rawToken: string,
): Promise<{ ok: true; row: SignatureRequestRow } | { ok: false; tableMissing: boolean }> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length < 16 || rawToken.length > 512) {
    return { ok: false, tableMissing: false };
  }
  const hash = hashToken(rawToken);
  const { data, error } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select(ROW_COLUMNS)
    .eq("token_hash", hash)
    .maybeSingle();
  if (error) {
    return { ok: false, tableMissing: signatureTableMissing(error) };
  }
  if (!data) return { ok: false, tableMissing: false };
  return { ok: true, row: data as unknown as SignatureRequestRow };
}
