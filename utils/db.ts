import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as serviceClient } from "./supabase";

/**
 * The canonical data-access accessor — the single chokepoint for DB access.
 *
 * WHY THIS EXISTS
 * Today every route imports the service-role `supabase` client directly (~70
 * call sites), which bypasses RLS and has no tenant scoping. That's fine while
 * the app is single-tenant, but the multi-tenant work needs ONE place to inject
 * per-request org scoping + RLS context — not edits across 70 files.
 *
 * `getDb()` is that place. Right now it returns the exact same service-role
 * client, so behaviour is identical. In tenancy Phase 1 it becomes a
 * request-scoped client that carries the caller's org/JWT so the database (via
 * RLS) enforces isolation. Call sites that pass a `DbContext` will get a scoped
 * client; cron/admin paths that pass nothing keep the service client.
 *
 * RULE: new code imports `getDb()` instead of the raw `supabase` client.
 * Existing call sites migrate to it incrementally (they each gain an `org_id`
 * filter in Phase 1 regardless, so that's the natural time to switch them).
 */
export type DbContext = {
  /** Resolved tenant/org id. Populated once multi-tenant; undefined = single-tenant/admin. */
  orgId?: string;
  /** Authenticated user identity, for building a request-scoped (RLS) client later. */
  userEmail?: string;
};

/**
 * Returns a Supabase client for data access.
 *
 * @param _ctx Reserved. Once multi-tenant, a context with `orgId`/`userEmail`
 *   yields an org-scoped, RLS-enforcing client; omitting it yields the
 *   service-role client (cron/admin). Today it is ignored and the service-role
 *   client is always returned — a deliberate no-op so this refactor is purely
 *   behaviour-preserving.
 */
export function getDb(ctx?: DbContext): SupabaseClient {
  void ctx; // reserved — see doc comment; ignored until tenancy Phase 1
  return serviceClient;
}
