import type { Metadata, Viewport } from "next";
import "./globals.css";
import { supabase } from "../utils/supabase";
import VoiceAssistant from "./components/VoiceAssistant";
import AppShell from "./components/AppShell";

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
async function getSidebarCounts(): Promise<{ pendingReview: number; draftBuilders: number }> {
  const out = { pendingReview: 0, draftBuilders: 0 };
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
  return out;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = await getSidebarCounts();
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 h-screen overflow-hidden">
        <AppShell
          sidebar={<>
          <div className="p-6 border-b border-gray-800 hidden lg:block">
            <div className="text-xl font-bold text-white">NextKey CRM</div>
            <div className="text-xs text-gray-400 mt-1">Powered by Elvis AI</div>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <p className="text-xs text-gray-500 uppercase font-semibold px-3 pt-2 pb-1">Command</p>
            <a href="/" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🎯</span> War Room
            </a>
            <a href="/advisor" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🎩</span> Advisor
            </a>
            <a href="/search" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🔍</span> Smart Search
            </a>
            <a href="/analytics" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📊</span> Analytics
            </a>
            <a href="/activity" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>⚡</span> Activity Feed
            </a>
            <a href="/pia" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📊</span> PIA Modeller
            </a>

            <p className="text-xs text-gray-500 uppercase font-semibold px-3 pt-4 pb-1">CRM</p>
            <a href="/opportunities" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🗂️</span> Opportunities
            </a>
            <a href="/leads" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🔥</span> Leads Pipeline
            </a>
            <a href="/contacts" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>👥</span> Contacts
            </a>
            <a href="/appointments" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📅</span> Appointments
            </a>
            <a href="/inbox" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>✉️</span> Inbox
            </a>
            <a href="/conversations" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>💬</span> Conversations (archive)
            </a>
            <a href="/notes" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📝</span> Notes (archive)
            </a>
            <a href="/tasks" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📌</span> Tasks
            </a>
            <a href="/media" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🗃️</span> Media Library
            </a>

            <p className="text-xs text-gray-500 uppercase font-semibold px-3 pt-4 pb-1">Stock</p>
            <a href="/properties" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🏘️</span> Aggregator Feed
            </a>
            <a href="/aggregator/review" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🔍</span>
              <span className="flex-1">Review Queue</span>
              {counts.pendingReview > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold">
                  {counts.pendingReview}
                </span>
              )}
            </a>
            <a href="/aggregator/runs" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📜</span> Ingestion Runs
            </a>
            <a href="/aggregator/builders" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🏗️</span>
              <span className="flex-1">Builders</span>
              {counts.draftBuilders > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold" title={`${counts.draftBuilders} draft(s) blocking ingestion`}>
                  {counts.draftBuilders}
                </span>
              )}
            </a>
            <a href="/suburbs" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🗺️</span> Suburb Intelligence
            </a>

            <p className="text-xs text-gray-500 uppercase font-semibold px-3 pt-4 pb-1">System</p>
            <a href="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>⚙️</span> Settings
            </a>

            <p className="text-xs text-gray-500 uppercase font-semibold px-3 pt-4 pb-1">Elvis</p>
            <a href="/approvals" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>✅</span> Approval Queue
            </a>
            <a href="/social" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📱</span> Social History
            </a>
            <a href="/sequences" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📨</span> Sequences
            </a>

          </nav>
          <div className="p-4 border-t border-gray-800">
            <div className="text-xs text-gray-500">NEXUS API: localhost:8765</div>
          </div>
          </>}
        >
          {children}
        </AppShell>
        <VoiceAssistant />
      </body>
    </html>
  );
}
