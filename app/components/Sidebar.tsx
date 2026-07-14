"use client";

/**
 * Sidebar — the primary CRM navigation.
 *
 * The nav grew to ~30 links across five groups, which made a single flat list
 * a long scroll. This renders each group as a collapsible accordion: only one
 * group is open at a time, and the group containing the current route opens
 * automatically (and re-opens on navigation). A pinned "Feedback & issues"
 * button sits above the groups so it's always reachable regardless of which
 * group is expanded.
 *
 * Data-driven so the mobile drawer (AppShell passes this same component in as
 * the `sidebar` prop) and the desktop rail stay in sync from one source.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type BadgeKey = "dealPackets" | "pendingReview" | "draftBuilders";
type Item = { href: string; icon: string; label: string; badge?: BadgeKey };
type Group = { key: string; label: string; icon: string; items: Item[] };

export type SidebarCounts = { pendingReview: number; draftBuilders: number; dealPackets: number };

const GROUPS: Group[] = [
  {
    key: "command",
    label: "Command",
    icon: "🧭",
    items: [
      { href: "/", icon: "🎯", label: "War Room" },
      { href: "/revenue", icon: "💰", label: "Revenue" },
      { href: "/advisor", icon: "🎩", label: "Advisor" },
      { href: "/brain", icon: "🧠", label: "Brain" },
      { href: "/search", icon: "🔍", label: "Smart Search" },
      { href: "/analytics", icon: "📊", label: "Analytics" },
      { href: "/activity", icon: "⚡", label: "Activity Feed" },
      { href: "/pia", icon: "📊", label: "PIA Modeller" },
      { href: "/feasibility", icon: "🗺️", label: "Planning Feasibility" },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    icon: "💼",
    items: [
      { href: "/opportunities", icon: "🗂️", label: "Opportunities" },
      { href: "/deal-analyser", icon: "📑", label: "Deal Analyser", badge: "dealPackets" },
      { href: "/leads", icon: "🔥", label: "Leads Pipeline" },
      { href: "/fact-find", icon: "📋", label: "Fact Find" },
      { href: "/needs-analysis", icon: "🧭", label: "Needs Analysis" },
      { href: "/credit-authorisation", icon: "🔏", label: "Credit Authorisation" },
      { href: "/contacts", icon: "👥", label: "Contacts" },
      { href: "/appointments", icon: "📅", label: "Appointments" },
      { href: "/inbox", icon: "✉️", label: "Inbox" },
      { href: "/broadcast", icon: "📣", label: "Broadcast" },
      { href: "/conversations", icon: "💬", label: "Conversations (archive)" },
      { href: "/notes", icon: "📝", label: "Notes (archive)" },
      { href: "/tasks", icon: "📌", label: "Tasks" },
      { href: "/media", icon: "🗃️", label: "Media Library" },
    ],
  },
  {
    key: "stock",
    label: "Stock",
    icon: "🏠",
    items: [
      { href: "/properties", icon: "🏘️", label: "Aggregator Feed" },
      { href: "/aggregator/review", icon: "🔍", label: "Review Queue", badge: "pendingReview" },
      { href: "/aggregator/runs", icon: "📜", label: "Ingestion Runs" },
      { href: "/aggregator/builders", icon: "🏗️", label: "Builders", badge: "draftBuilders" },
      { href: "/suburbs", icon: "🗺️", label: "Suburb Intelligence" },
    ],
  },
  {
    key: "system",
    label: "System",
    icon: "⚙️",
    items: [{ href: "/settings", icon: "⚙️", label: "Settings" }],
  },
  {
    key: "elvis",
    label: "Elvis",
    icon: "🤖",
    items: [
      { href: "/approvals", icon: "✅", label: "Approval Queue" },
      { href: "/social", icon: "📱", label: "Social History" },
      { href: "/sequences", icon: "📨", label: "Sequences" },
    ],
  },
];

function itemMatches(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** The href of the nav item that best matches the current path (longest match wins). */
function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const g of GROUPS) {
    for (const it of g.items) {
      if (itemMatches(it.href, pathname) && (best === null || it.href.length > best.length)) {
        best = it.href;
      }
    }
  }
  return best;
}

function groupKeyForPath(pathname: string): string | null {
  const href = activeHref(pathname);
  if (!href) return null;
  return GROUPS.find((g) => g.items.some((it) => it.href === href))?.key ?? null;
}

export default function Sidebar({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const [open, setOpen] = useState<string | null>(() => groupKeyForPath(pathname));

  // On navigation, open the group that owns the new route (and collapse the
  // rest) so the user always sees where they are. Manual toggles persist until
  // the next navigation. Done as a render-phase adjustment (not an effect) —
  // React re-renders immediately and this avoids a cascading effect render.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    const k = groupKeyForPath(pathname);
    if (k) setOpen(k);
  }

  const badgeCount = (key?: BadgeKey): number => (key ? counts[key] ?? 0 : 0);

  return (
    <>
      <div className="p-6 border-b border-gray-800 hidden lg:block">
        <div className="text-xl font-bold text-white">NextKey CRM</div>
        <div className="text-xs text-gray-400 mt-1">Powered by Elvis AI</div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {/* Always-visible Feedback / issues entry */}
        <Link
          href="/feedback"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition text-sm mb-2 ${
            itemMatches("/feedback", pathname)
              ? "bg-[#FFB627] border-[#FFB627] text-gray-900 font-semibold"
              : "border-[#FFB627]/50 text-[#FFB627] hover:bg-[#FFB627]/10"
          }`}
        >
          <span>💡</span>
          <span className="flex-1">Feedback &amp; issues</span>
        </Link>

        {GROUPS.map((g) => {
          const isOpen = open === g.key;
          return (
            <div key={g.key}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : g.key)}
                aria-expanded={isOpen}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 mt-1.5 rounded-lg text-sm font-bold tracking-wide transition ${
                  isOpen
                    ? "bg-gray-800 text-white shadow-sm ring-1 ring-white/10"
                    : "bg-gray-800/40 text-gray-100 hover:bg-gray-800 hover:text-white"
                }`}
              >
                <span className="text-base leading-none">{g.icon}</span>
                <span className="flex-1 text-left uppercase">{g.label}</span>
                <span className={`text-xs text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>▸</span>
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {g.items.map((it) => {
                    const isActive = active === it.href;
                    const count = badgeCount(it.badge);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition text-sm ${
                          isActive
                            ? "bg-gray-800 text-white"
                            : "text-gray-300 hover:bg-gray-800 hover:text-white"
                        }`}
                      >
                        <span>{it.icon}</span>
                        <span className="flex-1">{it.label}</span>
                        {count > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold">
                            {count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-500">NEXUS API: localhost:8765</div>
      </div>
    </>
  );
}
