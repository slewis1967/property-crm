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
 *  - Self-hosted LiveKit SFU (video calls): the browser opens a wss signal
 *    connection to it and fetches /rtc/validate over https, so BOTH schemes of
 *    nextkey-livekit.fly.dev must be in connect-src. Without this the client
 *    fails with "could not establish signal connection: Failed to fetch" and
 *    the call drops instantly. Keep this in sync with NEXT_PUBLIC_LIVEKIT_URL.
 *  - Virtual background (@livekit/track-processors → MediaPipe selfie
 *    segmentation): needs 'wasm-unsafe-eval' to instantiate the WASM module and
 *    blob:/worker-src for the MediaPipe glue that runs the segmenter. The WASM
 *    runtime + model file are fetched from jsDelivr and Google's model bucket,
 *    so cdn.jsdelivr.net and storage.googleapis.com are allowed in connect-src
 *    (and as script sources for the loader glue). If we ever self-host those
 *    assets under /public we can drop the CDN hosts back out.
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
      // Supabase REST/Auth/Realtime + Cloudflare Access team domain + LiveKit SFU
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.cloudflareaccess.com https://api.minimax.io https://api.minimaxi.com https://nextkey-livekit.fly.dev wss://nextkey-livekit.fly.dev https://cdn.jsdelivr.net https://storage.googleapis.com",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: https://*.brevo.com https://cdn.jsdelivr.net https://storage.googleapis.com",
      "worker-src 'self' blob:",
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
    // camera + microphone must be allowed for same-origin so video calls can
    // publish the user's webcam/mic (LiveKit). camera=() would disable it entirely.
    value: "camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * The signing pages embed the document the client is about to sign, as a PDF,
 * in an <object> on the same origin.
 *
 * `frame-ancestors 'none'` plus `X-Frame-Options: DENY` forbid that — including
 * from our own page — so the viewer refused to render and every signer saw
 * "Your browser can't display the document inline. Use the link below to open
 * it." The document was fine; the header would not let them read it in place.
 *
 * That is a bad failure for THIS page in particular. The whole point of a
 * consent form is that the person signing has read it, and a viewer that shows
 * an error where the document should be invites signing without reading.
 *
 * 'self' rather than removing the directive: only our own pages may frame these
 * responses, so the clickjacking protection the original was reaching for stays
 * in place everywhere it matters. Scoped to the two PDF endpoints and nothing
 * else — SAMEORIGIN is not the default for this app and should not become it.
 */
const FRAMEABLE_BY_US = SECURITY_HEADERS.map((h) => {
  if (h.key === "Content-Security-Policy") {
    return { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") };
  }
  if (h.key === "X-Frame-Options") return { key: "X-Frame-Options", value: "SAMEORIGIN" };
  return h;
});

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
      // The two same-origin PDF endpoints the signing page embeds.
      { source: "/api/sign/:token/preview", headers: FRAMEABLE_BY_US },
      { source: "/api/sign/:token/signed", headers: FRAMEABLE_BY_US },
      /* Everything else keeps frame-ancestors 'none'.
       *
       * The negative lookahead is load-bearing: Next.js APPLIES EVERY MATCHING
       * ENTRY rather than letting a later one win, so a plain "/:path*"
       * catch-all here would send a second Content-Security-Policy alongside
       * the relaxed one — and a browser given two CSP headers enforces the
       * intersection, i.e. the strictest. The exception would silently do
       * nothing. Excluding the paths is the only way to actually override. */
      {
        source: "/:path((?!api/sign/[^/]+/(?:preview|signed)).*)",
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
