import type { NextConfig } from "next";
import path from "path";

/**
 * Security headers applied to every response.
 *
 * CSP is tuned for the CRM's actual origin/connect needs:
 *  - Supabase REST + Realtime (default-deny except *.supabase.co)
 *  - Brevo + ClickSend outbound (script/fetch)
 *  - Anthropic / Gemini inference (via Hermes-side proxy; browsers never
 *    hit these directly, but allowlist in case of debug proxies)
 *  - Cloudflare Access team domain for any future iframe/window
 *    integrations
 *  - Inline styles required by Tailwind v4 / LightningCSS; scripts limited
 *    to self + Brevo's analytics
 *
 * Tighten further once we know we never load third-party widgets — the
 * 'unsafe-inline' on style-src is the only place we'd want to revisit.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Supabase REST/Auth/Realtime + Cloudflare Access team domain
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cloudflareaccess.com https://api.minimax.io https://api.minimaxi.com",
      "script-src 'self' 'unsafe-inline' https://*.brevo.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Keep the headless-Chromium PDF stack out of the webpack/serverless bundle —
  // @sparticuz/chromium ships a binary that must be require()d from node_modules
  // at runtime, not traced/bundled. See utils/pdf/render.ts.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // Image optimization — allow Supabase storage and NextKey brochure CDN
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "filecdn.minimax.chat" },
    ],
  },
};

export default nextConfig;
