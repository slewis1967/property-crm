import type { Metadata } from "next";
import MobileNav from "./MobileNav";

/**
 * The phone view — a separate, thumb-sized set of screens under /m.
 *
 * It exists so the CRM is usable on a phone WITHOUT reshaping the desktop
 * pages: nothing here is shared with the desktop layouts, and AppShell renders
 * /m with none of its chrome (see isPhoneViewPath). Same data, same APIs, same
 * Cloudflare Access login — only the screens differ. Anything the phone view
 * doesn't cover links through to the full page.
 */

export const metadata: Metadata = {
  title: "NextKey CRM",
};

export default function PhoneLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-xl pb-[calc(5rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
      <MobileNav />
    </div>
  );
}
