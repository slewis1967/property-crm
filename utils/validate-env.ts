/**
 * Startup environment validation.
 *
 * Checks required env vars at boot and throws a clear, actionable error
 * if any are missing. Prevents silent failures when a key isn't set in
 * .env.local or the Netlify dashboard.
 */

interface EnvVar {
  name: string;
  required: boolean;
  feature: string;
}

const CRITICAL_VARS: EnvVar[] = [
  // Core — app doesn't function without these
  { name: "ANTHROPIC_API_KEY", required: true, feature: "voice assistant + compliance review" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, feature: "property/contact data" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, feature: "Supabase client" },
  { name: "SUPABASE_SERVICE_KEY", required: true, feature: "server-side Supabase (bypasses RLS)" },
  { name: "NEXUS_API_KEY", required: true, feature: "NEXUS API proxy" },
  { name: "NEXUS_API_BASE", required: false, feature: "NEXUS API proxy — defaults to localhost:8765" },

  // Outbound comms — required for their respective features
  { name: "BREVO_API_KEY", required: false, feature: "outbound email" },
  { name: "CLICKSEND_API_KEY", required: false, feature: "outbound SMS" },
  { name: "CLICKSEND_USERNAME", required: false, feature: "outbound SMS" },

  // Auth — required for Cloudflare Access
  { name: "CF_ACCESS_TEAM_DOMAIN", required: false, feature: "Cloudflare Access auth" },
  { name: "CF_ACCESS_AUD", required: false, feature: "Cloudflare Access JWT validation" },

  // Calendar — optional, graceful fallback exists
  { name: "GOOGLE_OAUTH_CLIENT_ID", required: false, feature: "Google Calendar integration" },
  { name: "GOOGLE_OAUTH_CLIENT_SECRET", required: false, feature: "Google Calendar integration" },

  // Broadcast
  { name: "BROADCAST_REVIEW_SECRET", required: false, feature: "broadcast HMAC signing (falls back to SUPABASE_SERVICE_KEY if unset)" },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of CRITICAL_VARS) {
    const val = process.env[v.name];
    if (!val || val === "***") {
      if (v.required) {
        missing.push(`  - ${v.name} (${v.feature})`);
      } else {
        warnings.push(`  - ${v.name} (${v.feature})`);
      }
    }
  }

  if (missing.length > 0) {
    const msg =
      `\n╔══════════════════════════════════════════════════════════════╗\n` +
      `║  MISSING REQUIRED ENVIRONMENT VARIABLES                      ║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  The CRM cannot start. Add these to .env.local or the        ║\n` +
      `║  Netlify dashboard. See .env.example for documentation.       ║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `${missing.join("\n")}\n` +
      `╚══════════════════════════════════════════════════════════════╝\n`;
    throw new Error(msg);
  }

  if (warnings.length > 0) {
    console.warn(
      `\n⚠  Optional env vars not set — some features will be unavailable or use fallbacks:\n${warnings.join("\n")}\n`,
    );
  }

  console.log("[env] validation passed — all required variables present");
}