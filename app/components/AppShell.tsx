"use client";

/**
 * AppShell — responsive chrome wrapper.
 *
 * Desktop (lg+): the existing left sidebar + main content side-by-side, no
 * change from the pre-mobile layout.
 *
 * Mobile (< lg ~1024px): the sidebar collapses entirely. A dark top bar
 * shows the brand + a hamburger; tapping the hamburger slides the sidebar
 * in as a left drawer with a tappable scrim to dismiss. The drawer closes
 * itself on every route change so tapping a nav link auto-collapses it.
 *
 * Server-rendered sidebar content (with the live unread + draft counts)
 * is passed in as the `sidebar` prop — AppShell stays presentational so
 * the data fetch can keep happening at the layout level.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // Auto-close the drawer on navigation. Tapping a sidebar link routes to a
  // new page → pathname changes → drawer closes so the user doesn't have to
  // dismiss it manually.
  useEffect(() => {
    queueMicrotask(() => setDrawerOpen(false));
  }, [pathname]);

  // Lock body scroll while the drawer is open so the underlying page doesn't
  // scroll behind it on iOS.
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [drawerOpen]);

  // Public, standalone routes (the external e-signature page) render with NO app
  // chrome — no sidebar, no mobile bar. Hooks above run unconditionally so their
  // order stays stable across this branch.
  const isStandalone = pathname === "/sign" || pathname?.startsWith("/sign/");
  if (isStandalone) {
    return (
      <div data-appshell-root className="h-screen overflow-y-auto bg-gray-50">
        {children}
      </div>
    );
  }

  return (
    <div data-appshell-root className="flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Mobile-only top bar */}
      <div data-appshell-chrome className="lg:hidden flex items-center justify-between px-3 py-2.5 bg-gray-900 text-white shadow flex-shrink-0">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded hover:bg-white/10 text-xl"
          aria-label="Open menu"
        >
          ☰
        </button>
        <div className="text-sm font-bold">NextKey CRM</div>
        <div className="w-9" /> {/* spacer to balance the hamburger */}
      </div>

      {/* Desktop sidebar — always present on lg+ */}
      <aside data-appshell-chrome className="hidden lg:flex w-64 bg-gray-900 text-white flex-col flex-shrink-0">
        {sidebar}
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <aside className="w-72 max-w-[85vw] bg-gray-900 text-white flex flex-col overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="font-bold">NextKey CRM</span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-lg"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>
            {sidebar}
          </aside>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 bg-black/50"
            aria-label="Close menu"
          />
        </div>
      )}

      <main data-appshell-main className="flex-1 overflow-y-auto p-4 lg:p-8 min-w-0">
        {children}
      </main>
    </div>
  );
}
