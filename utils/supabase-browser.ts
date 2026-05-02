"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client (anon key only).
 *
 * Used for direct-to-Storage uploads via signed URLs — the server signs the
 * URL, then the browser PUTs the file straight to Supabase, bypassing
 * Netlify's serverless body-size + timeout limits.
 *
 * Reads the public env vars (NEXT_PUBLIC_*). Anon key only — no service-role
 * leakage to the browser.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseBrowser = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
