"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/m", label: "Today", icon: "🏠" },
  { href: "/m/leads", label: "Leads", icon: "🔥" },
  { href: "/m/contacts", label: "Contacts", icon: "👥" },
  { href: "/m/stock", label: "Stock", icon: "🏘️" },
];

/** Bottom tab bar for the phone view. Sits above the iPhone home indicator. */
export default function MobileNav() {
  const pathname = usePathname() ?? "";
  const isActive = (href: string) =>
    href === "/m" ? pathname === "/m" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-xl">
        {TABS.map((t) => {
          const active = isActive(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? "text-[#0F4C5C]" : "text-gray-500"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
