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
  // Core — app doesn't function without these.
  //
  // OPENROUTER_API_KEY is deliberately NOT required here (warn, don't throw).
  // utils/openrouter.ts now degrades gracefully when it's missing (lazy client,
  // AI calls fail at call-time with a clear 401 message rather than crashing).
  // validateEnv() runs at startup via instrumentation.ts, so hard-throwing on a
  // missing AI key would re-introduce the exact boot-crash that the lazy client
  // removes. The non-AI CRM (properties, contacts, opportunities) must still
  // boot and serve with the AI key absent — so this is a loud warning only.
  { name: "OPENROUTER_API_KEY", required: false, feature: "all AI features (voice, compliance, deal-analyser, document extraction) — via OpenRouter; degrades gracefully if unset" },
  { name: "NEXT_PUBLIC_SUPABASE_URL", required: true, feature: "property/contact data" },
  { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, feature: "Supabase client" },
  { name: "SUPABASE_SERVICE_KEY", required: true, feature: "server-side Supabase (bypasses RLS)" },
  // Correct name is NEXUS_INTERNAL_API_KEY (see utils/nexus-api.ts) — the old
  // "NEXUS_API_KEY" name existed nowhere else, so it was ALWAYS missing and
  // threw at startup, 500-ing the whole app. Also downgraded to optional:
  // NEXUS is a backend dependency the opportunities/leads pages already
  // degrade around, so a missing key must not block the entire CRM from boot.
  { name: "NEXUS_INTERNAL_API_KEY", required: false, feature: "NEXUS API proxy (opportunities/leads; degrades gracefully if unset)" },
  { name: "NEXUS_API_BASE", required: false, feature: "NEXUS API proxy — defaults to localhost:8765" },

  // Outbound comms — required for their respective features
  { name: "BREVO_API_KEY", required: false, feature: "outbound email" },
  { name: "CLICKSEND_API_KEY", required: false, feature: "outbound SMS" },
  { name: "CLICKSEND_USERNAME", required: false, feature: "outbound SMS" },

  // Auth — required in production for Cloudflare Access JWT verification.
  // In dev, missing CF Access means we'll fall back to header trust (still
  // gated by isProd() in cf-access.ts), so we don't need to crash dev boot.
  { name: "CF_ACCESS_TEAM_DOMAIN", required: true, feature: "Cloudflare Access JWT verification (required in production)" },
  { name: "CF_ACCESS_AUD", required: true, feature: "Cloudflare Access JWT verification — pin audience to your CRM application AUD (Cloudflare Zero Trust → Access → Applications → CRM → 'Application Audience (AUD)')" },

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