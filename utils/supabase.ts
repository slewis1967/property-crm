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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "Supabase server client not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in .env.local.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
