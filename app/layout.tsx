import type { Metadata, Viewport } from "next";
import "./globals.css";
import { supabase } from "../utils/supabase";
import VoiceAssistant from "./components/VoiceAssistant";
import AppShell from "./components/AppShell";
import PublicRouteGate from "./components/PublicRouteGate";
import Sidebar from "./components/Sidebar";

// PWA + mobile viewport. theme_color matches the brand teal so the
// chrome on iOS/Android tints to match the app on the home screen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F4C5C",
};

export const metadata: Metadata = {
  title: "Property Marketer CRM",
  description: "The War Room for Property Marketers",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NextKey CRM",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "NextKey Property Strategists",
    description: "Strategic property investment guidance for Australian buyers.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "NextKey Property Strategists",
    description: "Strategic property investment guidance for Australian buyers.",
    images: ["/twitter-image.png"],
  },
};

// Sidebar shows badges with the count of items needing attention. Single
// HEAD count(*) per badge — Postgres handles this in milliseconds, and
// missing the badge isn't worth a layout-fail so we swallow errors.
async function getSidebarCounts(): Promise<{ pendingReview: number; draftBuilders: number; dealPackets: number; amlReports: number }> {
  const out = { pendingReview: 0, draftBuilders: 0, dealPackets: 0, amlReports: 0 };
  try {
    const { count } = await supabase
      .from("property_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    out.pendingReview = count ?? 0;
  } catch { /* swallow */ }
  try {
    // Auto-deactivated drafts (e.g. Netlify newsletters) have draft=true
    // AND active=false — those are noise. Surface only the ones still
    // active, which is what Sean needs to confirm or reject. Each draft
    // here blocks future ingestion runs from that sender.
    const { count } = await supabase
      .from("builders")
      .select("id", { count: "exact", head: true })
      .eq("draft", true)
      .eq("active", true);
    out.draftBuilders = count ?? 0;
  } catch { /* swallow */ }
  try {
    // Packets awaiting operator action: rent still needed, or rent supplied but
    // reports not yet generated. reports_generated / failed drop off the badge.
    const { count } = await supabase
      .from("deal_packets")
      .select("id", { count: "exact", head: true })
      .in("status", ["needs_rent_input", "ready"]);
    out.dealPackets = count ?? 0;
  } catch { /* swallow */ }
  try {
    // AUSTRAC reports (SMR/TTR/IFTI) not yet lodged — each has a statutory
    // deadline, so surface the outstanding count as a compliance nudge.
    const { count } = await supabase
      .from("aml_reports")
      .select("id", { count: "exact", head: true })
      .neq("status", "lodged");
    out.amlReports = count ?? 0;
  } catch { /* swallow */ }
  return out;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await getSidebarCounts();
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 h-screen overflow-hidden">
        <AppShell sidebar={<Sidebar counts={counts} />}>
          {children}
        </AppShell>
        <PublicRouteGate>
          <VoiceAssistant />
        </PublicRouteGate>
      </body>
    </html>
  );
}
