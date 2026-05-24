import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client.
 *
 * Uses SUPABASE_SERVICE_KEY (not NEXT_PUBLIC_*), so this module is server-side only.
 * Importing from a "use client" component will fail at request time because
 * the env var is not exposed to the browser bundle.
 *
 * Why service key: row-level security (RLS) is enabled on contacts, property_leads,
 * and global_stock_pool with default-deny. The browser-exposed anon key reads
 * nothing. Server components and API routes use this client to fetch on behalf
 * of the Cloudflare-Access-authenticated user, bypassing RLS via service role.
 *
 * Re-introduce a separate browser client (anon key) only if a client component
 * legitimately needs Supabase access — and pair it with a per-table RLS policy
 * that explicitly allows what that browser session should see.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

// IMPORTANT: do NOT throw here on missing config.
//
// This module is imported by the root layout and nearly every route, so a
// module-load throw (the previous behaviour) crashes EVERY page — surfacing
// as a bare 500 "Internal Server Error" on login that no page-level try/catch
// can catch, because the throw happens at import time, before any component
// renders. A single missing/rotated prod env var (Netlify) = total outage.
//
// Instead: log loudly and build a non-throwing client with placeholder creds.
// Queries then fail at call-time as a rejected promise, which callers already
// guard (see the try/catch in app/page.tsx and app/layout.tsx). Net effect:
// a misconfigured key degrades to "data unavailable" banners, not a dead app.
if (!supabaseUrl || !supabaseServiceKey) {
  console.error(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_KEY is not set — " +
      "Supabase queries will fail until configured (Netlify env in prod, .env.local in dev). " +
      "Serving in degraded mode rather than crashing every route.",
  );
}

export const supabase = createClient(
  supabaseUrl || "https://unconfigured.supabase.invalid",
  supabaseServiceKey || "unconfigured",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
