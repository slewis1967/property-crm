/**
 * Shared helpers for the rep-side document-request API.
 *
 * These routes create and manage a borrower's document-collection session; the
 * public /api/portal/* routes are where the borrower then uploads. They live
 * apart on purpose — see proxy.ts isPublicPortalRoute — so the CF Access bypass
 * on /api/portal/* cannot strip the auth header from these management routes.
 */
export const DOCUMENT_REQUESTS_TABLE = "document_requests";

export const DOC_MIGRATION_HINT =
  "document_requests table missing — apply migrations/20260720_client_document_portal.sql";

/** A Supabase "relation does not exist" error, so the UI can show a helpful hint. */
export function docTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || /relation .* does not exist/i.test(error.message ?? "");
}

/** Columns safe to return to the rep UI. Never the token_hash. */
export const REQUEST_LIST_COLUMNS =
  "id,client_ref,application_id,applicant_name,applicant_email,applicant_phone,opportunity_id,status,drive_folder_url,submitted_at,created_by,expires_at,created_at,verification_status,yla_submitted_at";

/**
 * The list columns PLUS the training-video release state and the PA-received
 * marker that gates it.
 *
 * Kept separate from REQUEST_LIST_COLUMNS on purpose. The insert/detail paths
 * keep using the narrower set, so a missing 20260727/20260729 migration can only
 * affect the dashboard listing — which falls back (see the GET handler) —
 * instead of breaking request creation. Adding a not-yet-migrated column to a
 * shared SELECT is how the YLA sweep silently returned zero rows for weeks.
 */
export const REQUEST_LIST_COLUMNS_WITH_VIDEO =
  `${REQUEST_LIST_COLUMNS},training_video_released_at,training_video_released_by,pa_received_at,pa_received_by`;

/** Postgres 42703 — the column itself is absent, distinct from a missing table. */
export function docColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || /column .* does not exist/i.test(error.message ?? "");
}

export function isValidEmail(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** The customer-facing origin to build portal links from. */
export function publicOrigin(req: Request): string {
  const env = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/+$/, "");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}
