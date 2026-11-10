"use client";

/**
 * The signed-in portal frame: header in the firm's branding (NextKey's unless
 * they hold white_label), navigation limited to the features their plan
 * includes, and sign-out.
 *
 * Branding arrives already resolved and validated from the session
 * (resolveBranding) — colours are 6-digit hex and the logo is https — so it can
 * go straight into style attributes.
 *
 * Sign-out POSTs so the server revokes the session too; clearing the cookie in
 * the browser alone would leave a valid token behind.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { PartnerBranding } from "../../utils/partner";

export type NavItem = { href: string; label: string };

export default function PortalShell({
  branding,
  firmName,
  userName,
  nav,
  children,
}: {
  branding: PartnerBranding;
  firmName: string;
  userName: string | null;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/partner/logout", { method: "POST" });
    } finally {
      router.push("/partner");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ ["--brand" as string]: branding.primaryColor, ["--accent" as string]: branding.accentColor }}>
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/partner/stock" className="flex items-center gap-3">
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.displayName} className="h-8 w-auto" />
            ) : (
              <span className="text-lg font-semibold" style={{ color: branding.primaryColor }}>
                {branding.displayName}
              </span>
            )}
            <span className="border-l border-gray-200 pl-3">
              <span className="block text-sm font-semibold" style={{ color: branding.primaryColor }}>
                Partner Portal
              </span>
              {!branding.whiteLabel && <span className="block text-xs text-gray-500">{firmName}</span>}
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex items-center gap-1 text-sm">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`rounded-lg px-2.5 py-1.5 font-medium ${active ? "bg-gray-100 text-gray-900" : "text-gray-600 hover:text-gray-900"}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            {userName && <span className="hidden text-sm text-gray-600 md:inline">{userName}</span>}
            <button
              onClick={signOut}
              disabled={busy}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs leading-relaxed text-gray-500">
        Prices, availability and rent estimates are supplied by developers, are indicative only and can change
        without notice. Confirm with us before quoting a client.{" "}
        Builder, estate and lot details are released once a hold is in place.
      </footer>
    </div>
  );
}
