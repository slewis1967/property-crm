import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Property Marketer CRM",
  description: "The War Room for Property Marketers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 flex h-screen overflow-hidden">
        <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
          <div className="p-6 border-b border-gray-800">
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
              <span>🔍</span> Review Queue
            </a>
            <a href="/aggregator/runs" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>📜</span> Ingestion Runs
            </a>
            <a href="/aggregator/builders" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🏗️</span> Builders
            </a>
            <a href="/suburbs" className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 text-gray-300 hover:text-white transition text-sm">
              <span>🗺️</span> Suburb Intelligence
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
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {children}
        </main>
      </body>
    </html>
  );
}
